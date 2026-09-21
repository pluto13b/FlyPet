# 全脑实测数据

正式基准使用 Shiu 论文仓库固定提交 `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960` 的配套数据：

- https://github.com/philshiu/Drosophila_brain_model/blob/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/Connectivity_783.parquet
- https://github.com/philshiu/Drosophila_brain_model/blob/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/Completeness_783.csv

保留 **138639 个神经元、15091983 个神经元对连接、54492922 个突触接触**；没有设置 5 突触阈值，没有删除弱连接。连接符号直接保留文件的 `Excitatory x Connectivity`。全部端点和配套神经元 ID 匹配。

Codex v783 分类表和细胞类型表用于群体标注，其 139255 个 ID 中有 616 个不在论文配对版本里。本次没有把这 616 个细胞当作虚构孤立节点追加。版本范围以正式数据本身为准。

最初下载的 Codex `connections.csv.gz` 仅含 34153566 个突触接触；保留作来源差异记录，**不参与正式性能测量**。其编译统计见 output/whole-brain/codex-export-comparison.json。

`connectome.npz` 为自行编译的紧凑数组，`metadata.json` 保存统计、来源地址和文件大小；原始文件在 raw/。预处理代码为 experiments/whole_brain/prepare.py。

科学来源：FlyWire 的成年雌性果蝇脑连接组（Dorkenwald et al., Nature 2024；Schlegel et al., Nature 2024）；Shiu et al. 的 Drosophila 脑模型及配套发布。数据遵循其来源许可及署名要求，FlyWire 数据的非商业条款见上级 DATA_LICENSE.md；论文仓库 MIT 代码许可不能替代原始数据条款。

“全脑”指该公开发布的完整脑连接图，**不包含完整腹神经索和身体，不表示已恢复全部生理动力学、感觉或行为**。
