# 冻结视觉价值记忆

`memory.npz` 固定复制自本项目 `output/visual-learning/category/trained-memory.npz`：4 组种子，200 KC / 20 活跃，验证集选择第 5 轮。它是公共初始记忆，不在运行时写入，也不随实验输出自动变化。实际摄入产生的个体学习保存在 `.runtime` 的配对检查点中，不会覆盖本文件。

视觉前端沿用官方 flyvis 预训练模型；此文件仅包含本项目已训练的随机投影及 KC→MBON 记忆。旧封面测试 AUC 0.646 不代表桌面局部图块具有同样效果，更不代表食物语义识别。

读取与摄入更新调用 [IncentiveCircuit 作者实现](../../research/learning/InsectRobotics__IncentiveCircuit/upstream/src/incentive/circuit.py)，原作者 Evripidis Gkanias，许可 GPLv3+；[完整上游许可](../../research/learning/InsectRobotics__IncentiveCircuit/upstream/LICENSE) 保留。采用该实现的运行接口明确区分于原全脑模型。
