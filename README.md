# FlyPet

一只在 Windows 桌面活动、能查看神经活动并持续保存个体状态的数字果蝇。项目目标是可信、有趣的玩具，不做聊天机器人，也不自行开展一套生物学研究。

**当前可运行：全脑读出、持续区域检查与短时探索、官方 flyvis 空间视觉、密集三维脑图、桌面接触糖水，以及实际摄入触发的个体价值学习。简单近场糖水的自主接近已验证，复杂美食识别尚未实现。**

当前功能以本文和 [项目进度](docs/04-progress.md) 为准；[原始大纲 v0.2](FlyPet_PROJECT_OUTLINE_v0.2.md) 保留最初愿景，不是已完成功能清单。

## GitHub 仓库范围

仓库保留源码、文档、实验脚本、上游代码及其许可、小型运行资源和公共初始视觉记忆。`node_modules`、Python 环境、缓存、完整脑数据/官方权重下载、训练截图、`output` 结果以及 `.runtime` 个体存档不提交；这些文件继续保留在原电脑。本仓库不是正式个体的完整备份。

新克隆需要按下方“安装或恢复依赖”运行准备脚本，才可启动全脑应用。文档中的 `output/...` 链接指向本地实测产物，GitHub 上不包含这些文件；实验截图需要原始本地输入。复用代码和数据的来源与许可保留在 `vendor/`、`research/learning/InsectRobotics__IncentiveCircuit/upstream/LICENSE` 及 `data/*LICENSE*` 中。

## 启动与退出

本机环境已经准备好，双击 [FlyPet.cmd](FlyPet.cmd)。也可以运行：

```powershell
Set-Location 'D:\Desktop\FlyPet'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

会打开透明桌面苍蝇和观察室。关闭观察室只会隐藏窗口，苍蝇继续活动；从托盘重新打开，或点击观察室“退出”/托盘“保存并退出”。

观察室可用 **Win + Shift + S** 截图。默认允许苍蝇看见控制台；只有开启“忽略观察室”才在模型输入中把该区域填灰。为减少画面反馈，可将观察室移到另一块屏幕。这不影响你的系统截图。苍蝇本体仍使用原有截图排除设置。

开关含义：**暂停模拟**停止身体和神经推进；**视觉采样**控制屏幕输入；**视觉辅助转向**决定是否使用画面价值影响行走；**鼠标感知**是独立的几何威胁输入。详见 [截图修复与控件说明](docs/28-console-capture.md)。

负载较高时会显示“追赶计算，暂缓运动”，追上后自动继续；这与手动暂停不同。短暂积压不再触发永久故障，真实进程故障仍会停止。详见 [自动暂停修复](docs/31-recoverable-backpressure.md)。

2026-09-21 已优化常驻开销：官方视觉固定权重使用等价 CSR 执行，复眼只计算实际采样位置，观察室隐藏/最小化时停止绘图与预览编码，感觉和身体继续。全脑规模、2 ms 步长、视觉 721 列和作者权重保留。本机同一桌面验证流程中，进程树 CPU 从约 19.9% 降到 5.4%，工作集合计约 2.0 GB 降到 1.7 GB；口径、误差与复现步骤见 [性能优化实测](docs/33-performance-optimization.md)。

## 行为观察与测试端口

观察室“刚才发生了什么”面板新增 **观察 30 分钟**，可提前结束。观察室隐藏后仍继续记录，到时自动保存中文报告、轨迹图和原始数据。它只观察，不改变苍蝇的行为或学习参数。

运行中访问 [本机观察入口](http://127.0.0.1:8789/)。`GET /status` 返回当前状态，`GET /report`、`GET /summary`、`GET /trajectory.svg` 返回最近完成的结果。也可从 PowerShell 指定时长：

```powershell
Invoke-RestMethod http://127.0.0.1:8789/sessions -Method Post -ContentType 'application/json' -Body '{"durationSeconds":1800}'
Invoke-RestMethod http://127.0.0.1:8789/status
# 如需提前结束：
Invoke-RestMethod http://127.0.0.1:8789/sessions/stop -Method Post -ContentType 'application/json' -Body '{}'
```

每轮结果位于 `output/behavior-monitor/<日期与编号>/`，`latest.json` 指向最近完成的一轮。退出应用会提前结束并保留报告；强制终止时原始记录可能保留，但不能保证已生成报告。重启不会自动重开观察。

报告分别量化动作持续、轨迹与复访、鼠标威胁后响应、糖水接触/实际摄入、视觉意图/实际转向、暂停/计算追赶。没有刺激机会时标注无法判断，不把活动量包装成“宠物感总分”。不保存屏幕图片或键盘内容。接口与口径见 [行为观测说明](docs/32-behavior-monitor.md)。

## 使用

| 操作 | 实际效果 |
|---|---|
| 放置糖水 / 移除糖水 | 点击放置后在桌面左键选位置，Esc 取消；同时一滴，重复放置替换。落地接触并停下才摄入，6 秒储量，每秒降低饥饿约 0.12；飞越和暂停不消耗 |
| 鼠标接近苍蝇 | 近期几何威胁与 GF 放电共同触发普通逃逸；背景 GF 不再单独触发。真实光标仍进入视觉像素 |
| 几何感知开关 | 开关鼠标位置/接近刺激，不等同于视觉开关 |
| 视觉开关 | 开关真实屏幕采样与官方视觉观察；关闭时几何感知仍可独立工作 |
| 视觉转向开关 | 控制是否根据图像区域/个体价值形成检查目标；需要连续证据，关闭会停止视觉目标 |
| 空间分型 | 切换 T4a–d / T5a–d 的 721 位置活动；绿色增强、紫色减弱，不代表颜色或速度 |
| 前方视野（随朝向） | 显示随身体转向的局部灰度画面，上远下近、屏外留灰；橙圈仅辅助标注鼠标位置，光标像素本身也进入模型 |
| 右移亮块 / 左移暗圆 / 页面上滚 | 三种不同的测试刺激，不是其他真实摄像视角；仅切换官方观察模块输入 |
| 脑图拖动 / 滚轮 | 旋转 / 缩放；另有自动旋转、复位和活动层开关 |
| 面板“放大” / Esc | 独立放大脑图或视觉图 / 返回总览 |
| 刺激 GF / 沉默 GF | 对实际模拟逃逸神经群体进行干预，观察身体和活动变化 |
| 暂停 / 保存个体 | 暂停模拟 / 保存宠物和全脑配对检查点 |

## 三个容易混淆的数字与两条视觉链路

| 模块 | 当前规模与作用 |
|---|---|
| 控制身体的全脑 | 138639 个神经元、15091983 条连接对、54492922 个突触接触；自研简化 LIF，独立 Python/Numba 进程，2 ms 步长 |
| 三维解剖背景 | 139255 个真实代表坐标，是静态背景；叠加 668 个真实 ID 对应的活动探针，不代表所有背景点都在实时放电 |
| 官方 flyvis | 原始预训练模型的 45669 个模型单元、1513231 条连接、721 列单通道输入；固定权重，提供空间响应及局部区域的 Tm3 特征 |

实际身体链路：屏幕的 126 点粗采样 → 8753 个映射感受器 → 全脑；鼠标几何感知是另一条输入。行走、转向、梳理和逃逸读取神经活动，运动平滑、内部动机和手动进食仍有明确的工程规则。

官方视觉链路：朝向一致的局部桌面/测试图案 → 官方 BoxEye → 官方 flyvis → 输入与空间响应面板。另以约 2 Hz 提取少量真实图像对比区域，经 Tm3 与个体价值回路评分，形成可持续检查的工程目标；实际摄入可更新已配对线索的 KC→MBON 权重。没有重建到全脑的神经级视觉连接，官方视觉权重不微调。T4/T5 条形图显示相对基线活动，**不是 Hz、喜好分数或色觉**。

在较清楚背景上，把糖水放在苍蝇附近，可以观察其定向、持续接近、接触与学习事件；允许它被其他线索吸引或受惊中断。当前不包括食物语义、可靠的复杂页面自主觅食、声音、昼夜睡眠、完整腹神经索或真正跨显示器自由漫游。关闭程序期间时间暂停。完整范围与短时试验见 [持续目的和学习](docs/35-purpose-and-learning-implementation.md)。

## 安装或恢复依赖

仅在依赖、模型或数据缺失时运行。先启动本机 Clash 7897 代理：

```powershell
Set-Location 'D:\Desktop\FlyPet'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-brain.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-vision.ps1
```

使用已有 Node 和 Python 3.12；新增 Python 包分别安装在 `.venv-brain`、`.venv-vision`。本机运行使用 CPU，尚未安装 CUDA 推理栈或进行微调。Electron 44.4.3、three.js 0.186.0 由 package-lock.json 锁定；Python 依赖见各实验目录的 requirements.txt。

工作区为 `D:\Desktop\FlyPet`。使用提供的脚本可将下载、临时文件、JIT 和包缓存限定在工作区；不要改为全局安装，也不要直接照抄上游的默认缓存路径。

## 保存与文件位置

| 路径 | 用途 |
|---|---|
| `.runtime/pet/full-brain.npz` | 正式个体与全脑动态的配对检查点，启动时优先恢复 |
| `.runtime/pet/pet.json` | 个体状态摘要和观察模块诊断信息；单独改它不能覆盖 NPZ 中的状态 |
| `.runtime/pet/pet.before-whole-brain.json` | 首次全脑升级前的小回路备份；不是当前默认存档 |
| `.runtime/pet/logs/` | 运行日志，可能包含已修复问题的历史记录，须结合时间判断 |
| `.runtime/smoke/` | 独立测试个体，不覆盖正式个体 |
| `data/whole-brain` / `data/flyvis` / `data/brain-view` | 完整脑图、官方权重、三维坐标 |
| `.cache/` | 下载、包、编译与临时缓存 |
| `output/verification/` / `output/flyvis/` / `output/whole-brain/` | 桌面验证、官方视觉响应、全脑性能结果 |

每 15 秒和正常退出时保存。糖水位置/余量、行为保持、探索随机状态、持续目的与短时访问记录会保存；`visualLearning` 随全脑配对检查点保存个体 KC→MBON 权重。重启后视觉重新取景确认，公共离线初始记忆不被修改。

完整屏幕图像只在内存中处理。验证截图包含 FlyPet 界面及其中的低分辨率视野，可能反映屏幕局部内容；它们不是单独保存的原始桌面截图。

## 验证

运行 smoke 前，先在正式观察室保存并退出应用。测试使用独立个体，不会覆盖正式存档。

```powershell
Set-Location 'D:\Desktop\FlyPet'
. .\scripts\vision-env.ps1
npm.cmd test
& .venv-brain/Scripts/python.exe src/vision/test_inputs.py
& .venv-brain/Scripts/python.exe src/vision/test_view_geometry.py
npm.cmd run smoke
```

原生光标检查需要 Windows 系统光标可见。桌面 smoke 会启动测试窗口、切换测试输入、验证投喂/神经干预/三维交互/保存恢复，并持续运行约 30 秒后退出；应避免同时打开多份应用，以免资源竞争影响时间测量。

最近保存的结果（2026-09-21）：30 项 Node 测试通过，桌面 smoke 的 `passed` 为 true，包含真实截图区域引导的自主糖水接近、摄入学习及配对保存。另有独立全脑闭环/重启试验和 8 次简单线索配对试验。具体口径见 [当前进度](docs/04-progress.md) 与 [本轮记录](docs/35-purpose-and-learning-implementation.md)。

## 文档导航

- [工作约定与产品方向](docs/01-design-and-working-agreement.md)
- [当前进度、链路与验证](docs/04-progress.md)
- [官方视觉能力和用法](docs/12-official-vision-results.md)
- [三维脑图与开源复用](docs/13-dense-brain-view.md)
- [投喂、鼠标和测试图案修复](docs/14-usability-feeding-cursor.md)
- [官方视觉取景方向修正](docs/15-view-orientation-fix.md)
- [学习与互动：文献和开源方案调研](docs/16-learning-literature-and-options.md)（候选研究，尚未接入学习）
- [学习试验与 GPU 实测](docs/17-learning-pilot.md)（独立模型已学到关联；未接入正式个体）
- [页面封面视觉关联试验](docs/18-visual-association-pilot.md)（真实图像输入，独立评分演示）
- [新封面迁移与饱和度检查](docs/19-new-cover-transfer.md)（旧记忆、18 张新图、等亮度去色对照）
- [食物类别关联数据准备](docs/20-food-dataset-pilot.md)（首次准备记录；后续已补充非食物素材）
- [食物类别关联 GPU 训练](docs/21-food-category-training.md)（130 张图片，独立测试 AUC 0.646，未接入正式个体）
- [找到苍蝇：召回与透明窗口显示](docs/22-find-fly.md)
- [行为现状报告：为什么视觉开关与观看内容对运动影响不明显](docs/23-behavior-review.md)
- [Life Layer v0.1：身体状态、环境交互与社区经验](docs/24-body-and-life-layer.md)（设计阶段）
- [Life Layer 实现步骤与短时训练预算](docs/25-life-layer-implementation.md)（先接通身体闭环，按需轻度训练）
- 历史方案/调研：[开源选型](docs/02-open-source-research.md)、[初始实施规划](docs/03-implementation-plan.md)、[坐标报错修复](docs/05-position-error-fix.md)、[动作改进](docs/06-body-motion-polish.md)、[全脑实测方案](docs/07-whole-brain-benchmark-plan.md)、[全脑实测结果](docs/08-whole-brain-results.md)、[全脑接入](docs/09-whole-brain-integration.md)、[视觉生物学资料](docs/10-vision-biology-research.md)、[官方视觉接入规划](docs/11-official-vision-plan.md)
- 数据与许可：[全脑数据](data/whole-brain/README.md)、[官方模型](data/flyvis/README.md)、[解剖坐标](data/brain-view/README.md)、[身体/点云复用](vendor/desktop-fly/README.md)、[OrbitControls](vendor/three/README.md)

保留各来源许可与署名。代码许可不能替代数据许可；当前 FlyWire 派生数据按其来源 CC BY-NC 4.0 使用。


Life Layer A/B 已交付；C/D 现已接入简单近场区域检查、接近和摄入触发的个体学习。复杂页面泛化与长期宠物体验仍需实际使用检验。详见 [最新实施记录](docs/35-purpose-and-learning-implementation.md)。

[空间视觉升级与验证](docs/27-spatial-vision-upgrade.md)：双视图、自运动反馈、冻结学习价值转向，本轮未训练。

[周边广视野升级](docs/29-peripheral-vision.md)：身体周围半径 480 DIP、八方向粗感知，明显侧后方变化可触发短暂低速转身；前方精细视觉仍保留。需要同时开启“视觉采样”和“视觉辅助转向”。20 项核心测试及桌面验证通过，未新增训练。

[视野灰块修正与输入对照](docs/30-visual-input-visibility.md)：默认关闭整窗遮罩，同帧采集原图与复眼输入并排，神经活动切换查看。
