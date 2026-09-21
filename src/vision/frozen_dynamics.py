"""Fixed-weight CPU inference for the shipped flyvis PPNeuronIGRSynapses model.

Same 20 ms Euler equation, connectivity, ReLU and learned parameters. Fold the
constant edge weights into CSR once instead of gathering 1.5M edge tensors each
step. This is an inference execution path, not a new biological model.
"""
import numpy as np
from scipy.sparse import csr_matrix


class FrozenDynamics:
    dt = .02

    def __init__(self, model):
        if type(model.dynamics).__name__ != 'PPNeuronIGRSynapses' or type(model.dynamics.activation).__name__ != 'ReLU':
            raise ValueError('Frozen CPU inference requires the validated PPNeuronIGRSynapses + ReLU model')
        if model.training or any(p.requires_grad for p in model.parameters()):
            raise ValueError('Frozen CPU inference is only for fixed evaluation weights')
        model.clamp()
        params = model._param_api()
        array = lambda v: v.detach().cpu().numpy().copy()
        self.bias = array(params.nodes.bias)
        self.inverse_tau = np.float32(1) / np.maximum(array(params.nodes.time_const), np.float32(self.dt))
        self.n = model.n_nodes
        self.edge_count = len(model._source_indices)
        self.weights = csr_matrix((array(params.edges.weight),
                                   (array(model._target_indices), array(model._source_indices))),
                                  shape=(self.n, self.n), dtype=np.float32)
        self.input_index = model.stimulus.input_index.copy()

    def advance(self, retina, steps, state):
        """Hold one sampled image for steps, returning only the final node state."""
        retina = np.asarray(retina, dtype=np.float32).reshape(len(state), 1, -1)
        for _ in range(steps):
            current = self.weights @ np.maximum(state, np.float32(0)).T
            velocity = -state + self.bias
            velocity += current.T
            velocity[:, self.input_index] += retina
            velocity *= self.inverse_tau
            state = state + velocity * np.float32(self.dt)
        return state

    def steady_state(self, seconds=1., batch=1):
        initial = np.broadcast_to(self.bias, (batch, self.n)).copy()
        grey = np.full((batch, self.input_index.shape[-1]), .5, dtype=np.float32)
        return self.advance(grey, int(seconds/self.dt), initial)


class SampledBoxEye:
    """Evaluate the author's 13x13 box filter only at its 721 sample centers."""
    def __init__(self, eye):
        self.centers=eye.receptor_centers.cpu().numpy().copy()
        self.kernel=eye.kernel_size
        self.pad=eye.pad
        self.minimum=eye.min_frame_size.cpu().tolist()
        self.indices={}

    def __call__(self, images):
        images=np.asarray(images,dtype=np.float32)
        if images.ndim==2:images=images[None]
        batch,height,width=images.shape
        if height<self.minimum[0] or width<self.minimum[1]:
            # Match the upstream resize for the UI's 128px synthetic stimuli too.
            import torch
            from torchvision.transforms.functional import resize
            images=resize(torch.from_numpy(images[:,None]),self.minimum).numpy()[:,0]
            batch,height,width=images.shape
        key=(height,width)
        if key not in self.indices:
            # Worker uses 403x403 inputs: same centers, truncation and zero padding as BoxEye.
            c=self.centers+np.array([height//2,width//2])
            dy,dx=np.indices((self.kernel,self.kernel))
            self.indices[key]=(c[:,0,None]+dy.ravel())*(width+self.pad[0]+self.pad[1])+c[:,1,None]+dx.ravel()
        padded=np.pad(images,((0,0),(self.pad[2],self.pad[3]),(self.pad[0],self.pad[1])))
        patches=padded.reshape(batch,-1)[:,self.indices[key]]
        return patches.sum(axis=-1,dtype=np.float32)/np.float32(self.kernel**2)
