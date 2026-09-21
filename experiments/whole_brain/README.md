# FlyPet 全脑性能实验

数据准备、稀疏 LIF 引擎和基准程序均为本项目编写。没有将外部桌宠代码作为核心引擎。

## 运行

在项目根目录 PowerShell 中：

```powershell
. .\scripts\env.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-brain.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark-brain.ps1
$env:PYTHONPYCACHEPREFIX = "$PWD\.cache\pycache"
$env:NUMBA_CACHE_DIR = "$PWD\.cache\numba"
& .venv-brain/Scripts/python.exe experiments/whole_brain/pace.py 2
```

环境和数据已在本机准备好，无需重复 setup。setup 使用 Clash 7897，只把新增依赖安装到工作区虚拟环境，并复用已有环境包。固定包版本见 requirements.txt。

## 文件

- prepare.py：读取论文配对版本，保留全部连接，建立 CSR 与群体索引。
- engine.py：单线程 Numba 编译 LIF；每步更新所有神经元，只遍历放电神经元的出边。
- test_engine.py：小图检查静默、兴奋/抑制传递与分块运行一致性。
- benchmark.py：0.5/1/2 ms × 三种输入条件的速度与活动；另测 1 ms 下 30 秒实时调度。
- pace.py：指定步长的 30 秒持续实时调度测试。

## 测量口径

输入分别为无刺激、全部已标注光感受器 50 Hz 外部脉冲、全部中央脑细胞 100 Hz 外部脉冲；这是受控计算负载，不是真实视觉任务。每个场景先模拟 1 秒稳定，再计时 5 秒；JIT 预热独立记录。

单核百分比用进程 CPU 时间/墙钟时间；整机归一化百分比再除以逻辑处理器数（本机 24）。它不等于物理核心比例，也不表示功耗。RSS 是本基准进程采样到的常驻内存，包含解释器、JIT 和数据，不包含 Electron。

实时测试每 50 ms 推进 50 ms 模拟时间。deadline_misses 是完成时晚于该块计划终点的次数；没有丢弃模拟步。偶发超时与平均算得过来是两回事。

GPU、桌面捕获、3D 绘制、真实复眼、学习、存档及全脑到桌宠的通信尚未包含。膜电位参数、适应项、抑制增益和输入脉冲均为简化模型，参数记录在 benchmark.json；该实验不等同于复现 Shiu 论文结果。
