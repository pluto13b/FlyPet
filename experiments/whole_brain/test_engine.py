import unittest
import numpy as np
from engine import WholeBrain,advance

class EngineTest(unittest.TestCase):
    def graph(self,weight=20.):
        return {'indptr':np.array([0,1,1],np.int64),'indices':np.array([1],np.int32),
                'weights':np.array([weight],np.float32)}
    def test_quiet_and_connected_response(self):
        for weight in [20.,-20.,0.]:
            b=WholeBrain(self.graph(weight));b.run(.1,np.empty(0,np.int32),0)
            self.assertEqual(int(b.counts.sum()),0)
            b.run(.5,np.array([0],np.int32),100)
            self.assertGreater(int(b.counts[0]),0)
            if weight>0:self.assertGreater(int(b.counts[1]),0)
            else:self.assertEqual(int(b.counts[1]),0)
    def test_chunking_preserves_dynamics(self):
        a=WholeBrain(self.graph());b=WholeBrain(self.graph());inputs=np.array([0],np.int32)
        a.run(.2,inputs,100)
        for _ in range(4):b.run(.05,inputs,100)
        np.testing.assert_array_equal(a.v,b.v)
        np.testing.assert_array_equal(a.counts,b.counts)
        self.assertEqual(a.rng,b.rng)

if __name__=='__main__':unittest.main()
