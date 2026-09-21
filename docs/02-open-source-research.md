# FlyPet 开源项目调研与选型建议

> 历史调研记录：本文件描述首次选型时的候选与证据；当时的“未实现/尚未选择”不代表当前状态。当前实现见 [项目进度](04-progress.md)。stars 为当时快照。

调研日期：2026-09-19。状态：文档与源码调研完成，未安装、运行或集成上游项目。

本报告承接 [已确认设计与工作约定](01-design-and-working-agreement.md)。原始 v0.2 大纲保留不改；本报告修正对上游能力的预期，所有架构建议仍待讨论。

## 1. 结论

可以大量复用现有项目，尤其是身体、动作、Windows 透明窗口和神经活动显示，不需要从零建模。但目前检查的候选中，没有一个已经证明可以直接完成“观看任意美食视频，自主辨认可食区域、进食、形成经验并长期保存同一个体”。

建议首先验证 **DesktopFly 的 Windows 身体与动作**；将 **flyvis** 列为真实屏幕视觉的重点候选；用 **Shiu 原始模型**核对神经动力学来源。**fruit-fly** 的屏幕采样与复眼实现值得参考，但不能因为它模拟全脑，就直接选为核心。**fly-api** 的奖励学习适合作为专项实验参考。

这不是建议立刻把五套系统拼起来。先分别验证少量关键链路，再决定采用哪一个脑模型。用户尚未选择“全脑优先”或“关键回路优先”，本报告不替用户定案。

## 2. 候选与 stars

stars 为本次 GitHub API 查询值，会变化；不是稳定性或科学有效性的保证。精确提交版本与查询时间见 [repositories.json](../research/repositories.json)。

| 项目 | Stars | 代码许可证/状态 | 对 FlyPet 的价值 | 建议 |
|---|---:|---|---|---|
| [DenisSergeevitch/desktop-fly](https://github.com/DenisSergeevitch/desktop-fly) | 1007 | MIT；数据另有许可 | Windows + Electron/three.js，程序化 3D 果蝇、动作、真实回路与 Brain View | 首选身体和桌面底座候选 |
| [TuragaLab/flybody](https://github.com/TuragaLab/flybody) | 920 | Apache-2.0 | 精细身体、Blender/OBJ/MJCF 资产，MuJoCo 行走与飞行任务 | 身体资产与运动参考；按效果需要再引入 |
| [NeLy-EPFL/flygym](https://github.com/NeLy-EPFL/flygym) | 357 | Apache-2.0 | NeuroMechFly 身体、感觉运动仿真、接触反馈 | 步态和身体控制参考，不先引入整套物理世界 |
| [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) | 323 | MIT | 原始连接组 LIF 模型、刺激/沉默神经元及 spike 输出 | 脑模型来源与对照实验 |
| [SpikeCalls/FlyDrones](https://github.com/SpikeCalls/FlyDrones) | 188 | MIT；连接组数据另计 | 图像特征→神经输入→下行神经读出 | 运动桥接参考，不作为桌宠成品 |
| [TuragaLab/flyvis](https://github.com/TuragaLab/flyvis) | 179 | MIT | 连接组约束的视觉动力学、预训练模型、神经响应分析 | 重点视觉候选 |
| [NeLy-EPFL/NeuroMechFly](https://github.com/NeLy-EPFL/NeuroMechFly) | 62 | Apache-2.0；已归档 | 旧版身体仿真 | 不作为新项目底座，优先看 FlyGym |
| [dtch1997/fly-api](https://github.com/dtch1997/fly-api) | 7 | MIT；含 Apache-2.0 上游代码 | 味觉刺激、嗅觉条件学习及身体桥接实验 | 低 star 专项参考 |
| [pusulamkendim/flywire-neuro](https://github.com/pusulamkendim/flywire-neuro) | 6 | 仓库声明 MIT；资源需逐项看来源 | 脑与身体整合方向 | 仅初筛，不纳入优先底座 |
| [freaker2k7/desktop-fly](https://github.com/freaker2k7/desktop-fly) | 3 | MIT | 另一个 MaleCNS 桌面苍蝇项目 | 仅初筛，注意与上方同名项目区分 |
| [rembish/fruit-fly](https://github.com/rembish/fruit-fly) | 1 | MIT；FlyWire 数据另计 | 屏幕采样、复眼、全脑 LIF、Windows 后端、HUD | 高相关但低 star，不默认整仓依赖 |

这里的主候选均满足超过 100 stars 的偏好。低 star 项目保留的原因是与大纲高度相关，或者包含可独立参考的实验；未将它们视为已选依赖。

## 3. 身体和动作：确实有现成代码

### 3.1 DesktopFly：最贴合当前产品形态

已阅读 Windows README、package.json、flymodel.js、sim.js、signals.js、overlay.js、brain.js 及数据许可证。

- `windows/src/flymodel.js` 包含 three.js 程序化身体和行为/动作实现，可以先使用，不必先制作新 3D 资产。
- `windows/src/signals.js` 将实际神经读出映射为身体命令：GF 消费事件对应逃逸，DNa 左右差对应转向，MDN 对应后退，DNp09 对应行走驱动。映射中的阈值与比例是人为建模参数。
- 当前上游描述为 668 个 FlyWire 回路神经元，加 1045 个 MaleCNS 运动回路神经元。不同标本之间通过人为定义的接口连接，并非来自一只标本的完整神经系统。
- Brain View 用约 23210 个真实位置构成背景点云，另叠加实际参与模拟的回路。**显示点数不等于模拟神经元数**，现有视图也不包含全部 MaleCNS 运动网络。
- Windows 使用透明 Electron 覆盖窗口、three.js 和 koffi。已有窗口边缘玩法，但我们的设计可以保持自由屏幕活动，不必继续扩展窗口地形。

关键缺口：Windows README 明确不采样屏幕像素。鼠标坐标/速度、窗口几何等被转换为感觉刺激。因此现有身体可以复用，但原样运行不满足“看见 B 站画面”。上游也说明 Windows 原生感知仍需 Windows 验证，本轮没有替它验证。

证据：[Windows 说明](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/windows/README.md)、[动作读出](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/windows/src/signals.js)、[脑显示](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/windows/renderer/brain.js)。

### 3.2 flybody / FlyGym：更精细的身体来源

flybody 有解剖结构身体、Blender 源模型与 OBJ 网格，包含行走、飞行和视觉飞行的任务环境。它的运动控制涉及物理仿真与学习策略；模型资产、控制策略和桌面渲染不是一个可以直接替换的文件。若后续觉得 DesktopFly 外观不足，可以先评估资产转换及关节对应，不必因此更换整个产品架构。

FlyGym 提供身体、复眼、接触/关节反馈等仿真能力。其当前主线已经是 2.x API，README 明确与 1.x 不兼容，且功能尚未全部迁移。fly-api 引用了 1.2.1 的代码，因此不能假设安装最新 FlyGym 即可运行这些旧示例。

建议：先看 DesktopFly 的实际身体效果；只有效果存在明显不足时，才验证 flybody 资产或 FlyGym 控制器。暂不引入完整 MuJoCo 地形/物理系统。

证据：[flybody 模型构建说明](https://github.com/TuragaLab/flybody/blob/d015e9bfe441bd90ae431bac24c55cb74bdbce26/flybody/fruitfly/build_fruitfly/README.md)、[任务入口](https://github.com/TuragaLab/flybody/blob/d015e9bfe441bd90ae431bac24c55cb74bdbce26/flybody/fly_envs.py)、[FlyGym 版本说明](https://github.com/NeLy-EPFL/flygym/blob/38c8ec61034cd59bc5ba0de20688d4a3c0000d60/README.md)。

## 4. 视觉与脑：重要的是实际闭环

### 4.1 fruit-fly：有真实屏幕输入，但存在动作绕行路径

已读 `brain.py`、`senses.py`、`motor.py`、`data.py`、Windows 后端及 README。

其屏幕视觉进入左右眼采样；`senses.py` 使用亮度和时间变化计算感觉驱动，并把鼠标作为人工构造的遮暗圆盘放进视网膜。默认还根据鼠标相对位置与接近速度，直接刺激 LC4/LPLC2；`--pure-retina` 关闭的是这条额外注入。

更关键的是：`motor.py` 的落地分支在 `threat > 0.5` 时直接调用 `_startle(..., escape=True)`。该 threat 来自感觉层的几何计算，而不是 GF 神经活动。因此，**仅打开 pure-retina 再观察是否飞走，不足以证明逃逸由视网膜→脑→GF 完整产生**。后续验证必须区分 GF 触发与这个外围动作分支。

作者的实验记录还报告：视觉逼近会提高 LC4/LPLC2 响应，但未有效传到 GF；亮度左右不对称也未产生明确趋光转向。这是作者的结果，本机尚未复现。

网络有脉冲频率适应和人为噪声调节机制；这些不能直接视为长期奖励学习。现有“被拍死后重生”的机制也与“同一个体连续存在”的目标不一致，不应直接沿用。

判断：屏幕采样、复眼映射、探针和实验值得吸收；全脑规模本身不能证明已经具备可用的视觉行为或食物学习。

证据：[感觉输入](https://github.com/rembish/fruit-fly/blob/5fd0166c2a6e121222c94a2e3653072b8024b1f3/fruitfly/senses.py)、[动作控制](https://github.com/rembish/fruit-fly/blob/5fd0166c2a6e121222c94a2e3653072b8024b1f3/fruitfly/motor.py)、[神经动力学](https://github.com/rembish/fruit-fly/blob/5fd0166c2a6e121222c94a2e3653072b8024b1f3/fruitfly/brain.py)。

### 4.2 flyvis：值得重点比较的视觉模型

官方实现提供连接组约束的视觉模型与预训练参数。`PPNeuronIGRSynapses` 是连续活动、渐变释放突触模型，不是给所有细胞套统一脉冲 LIF；代码从连接符号、突触数、强度生成权重，并计算活动变化。

这与果蝇视觉前端的需求相符，值得用实际屏幕片段测试；但它不是整脑、桌宠或食物识别器，输出接到逃逸/转向回路需要明确接口，不能直接宣称“接上就会看懂视频”。

本次查看的配置要求 Python >=3.9,<3.13，依赖 PyTorch 等；预训练可选依赖还带有较旧的版本约束。优先检查本机环境是否能运行所选模型，再决定是否需要工作区内隔离环境，不先安装整套训练工具。

证据：[神经动力学](https://github.com/TuragaLab/flyvis/blob/92b3845cc426dd309a1a0e1b3890156c42e14021/flyvis/network/dynamics.py)、[依赖约束](https://github.com/TuragaLab/flyvis/blob/92b3845cc426dd309a1a0e1b3890156c42e14021/pyproject.toml)。

### 4.3 FlyDrones：桥接思路可用，演示要分清模型

`retina.py` 在网络之外计算光流与扩张特征，再映射到视觉神经输入；`decoder.py` 用带基线、增益与平滑的线性读出生成运动命令，并包含显式逃逸规则。因此它适合参考输入输出设计，不能称为视觉计算完全由连接组自行完成。

README 明确：浏览器演示与 GIF 使用 850 神经元的手工连接 MiniFly，真实 MaleCNS 是另一条加载与校准路径。其大网络性能表使用随机图基准，也不是实际 MaleCNS 在本机的性能证据。

证据：[视觉特征代码](https://github.com/SpikeCalls/FlyDrones/blob/3e269346b3882c291d2a977bc2c2c6a9c9213c21/src/flydrones/senses/retina.py)、[动作读出代码](https://github.com/SpikeCalls/FlyDrones/blob/3e269346b3882c291d2a977bc2c2c6a9c9213c21/src/flydrones/motor/decoder.py)、[演示说明](https://github.com/SpikeCalls/FlyDrones/blob/3e269346b3882c291d2a977bc2c2c6a9c9213c21/README.md)。

### 4.4 Shiu 模型：神经引擎原始参照

`model.py` 使用 Brian2，包含 LIF 参数、连接权重、Poisson 刺激与神经元沉默操作。输出 spike 时间与频率，适合做刺激响应参照。它本身没有 Windows 身体、屏幕复眼或现成长期宠物系统。README 默认数据版本为 630，并说明切换 783 的配置，比较实验时必须对齐版本。

证据：[原始模型](https://github.com/philshiu/Drosophila_brain_model/blob/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/model.py)、[运行说明](https://github.com/philshiu/Drosophila_brain_model/blob/91bdd1e7dcf193f3e7ca5a8933497fcef63b7960/Readme.md)。

## 5. 进食与学习：有可参考实验，但未覆盖美食视频

fly-api 的学习代码确实改变 KC→MBON 权重：当当前回合的 KC 活动和 PAM 奖励门控条件满足时，对相应突触做乘法衰减。这不是只在字幕中声称“学会了”。

但当前实验输入是指定嗅觉通道；奖励直接刺激多巴胺细胞。导航报告也明确，左右触角价值比较、转向与抵达规则属于人工桥接。不能把嗅觉条件学习的结果直接等同于对任意屏幕食物图像的学习。

可借鉴的是“感觉模式→神经响应→奖励相关权重变化→行为变化”的实验结构。视觉如何接入这套学习回路、哪里能够进食、饥饿如何调制，目前保持未定，不先设计一个食物识别规则去冒充模型已有能力。

证据：[学习实现](https://github.com/dtch1997/fly-api/blob/a6ad07a810b1a43cd0356149c07b32105eb46d2a/experiments/learning/learning_driver_mb.py)、[学习报告](https://github.com/dtch1997/fly-api/blob/a6ad07a810b1a43cd0356149c07b32105eb46d2a/experiments/learning/report.md)、[导航报告](https://github.com/dtch1997/fly-api/blob/a6ad07a810b1a43cd0356149c07b32105eb46d2a/experiments/navigation/report.md)。

对 FlyPet 的具体影响：

| 目标体验 | 当前证据 | 后续需要确定 |
|---|---|---|
| 自由活动、飞行、梳理、休息 | 有现成身体与动作代码 | 本机实际视觉效果和常驻开销 |
| 被鼠标吓跑 | 有神经回路和人工桥接的多种实现 | 选哪条输入路径，保证观察面板准确说明来源 |
| 看见真实屏幕内容 | fruit-fly 有像素输入；flyvis 有视觉模型 | 视觉响应是否能影响可解释的行动 |
| 糖水进食 | fly-api 有味觉→进食相关神经响应实验 | 屏幕接触、营养与身体动画如何连接 |
| 美食视频附近探索和进食 | 尚无本轮候选的直接验证 | 保留目标，先测视觉和奖励，不承诺即插即用 |
| “饿”“吃”“跑！” | 可从实际内部变量和决策生成 | 明确每个字幕对应哪个状态或事件 |
| 连续同一个体 | 不应依赖上游重生/重置逻辑 | 保存哪些状态、学习权重与经历，以及离线时间规则 |

## 6. 许可与复用范围

代码许可与数据许可分开核对。DesktopFly 顶层 GitHub API 给出 NOASSERTION，但仓库 LICENSE/README 明确代码 MIT；其 `brain_points.json`、`circuit.json` 标明 CC BY-NC 4.0，MaleCNS 派生运动数据标明 CC BY 4.0。记录这些差异，个人玩具阶段按来源保留署名和许可；若以后改变发行用途，再核查对应资产与数据条款。

flybody/FlyGym 的 Apache-2.0 与其来源声明需要随实际复用内容保留。尚未下载大型资产包或预训练权重，因此不把所有第三方资产都视为已审查。

证据：[DesktopFly 数据许可](https://github.com/DenisSergeevitch/desktop-fly/blob/32b00011e83c3dc85fa3ea0b3934155b04f1635d/data/DATA_LICENSE.md)。

## 7. 下一阶段建议：先写验证文档，再做三个小实验

以下为建议，尚未执行。无需先搭完整 FlyPet。

1. **身体基线**：运行 DesktopFly Windows 版，看行走、飞行、梳理、休息及神经刺激如何影响动作；记录 CPU/内存/帧率和实际效果。回答“身体能不能直接用”。
2. **视觉闭环**：给候选模型相同的静止、滚动、逼近及视频片段，记录视网膜、关键群体响应和动作来源。先用 fruit-fly 定位现有闭环，再决定是否比较 flyvis。区分直接刺激、外围 threat 分支和神经读出，不要求大规模 benchmark。回答“它看到的东西能否可靠改变行为”。
3. **最小奖励实验**：只有视觉路线有结果后，再测试一种感觉模式与糖水奖励关联，以及保存/恢复后是否保留变化。嗅觉实验只能说明机制可用，不能代替视觉学习结果。回答“经验是否真的进入了可持续状态”。

结束这三项后，才确定最终脑模型、觅食规则和需要补充的产品功能。主线仍然是用户所说的“真实一点、有趣的玩具”，不扩展成学术全套验证。

## 8. 本机环境与本轮交付边界

只读检查发现本机已有 Node、Python 3.12 路径、Git、uv；CPU 为 i7-14650HX，约 31.7 GiB 内存，RTX 4060 Laptop GPU。这里只核对可执行文件路径和系统报告，未验证包版本、CUDA、依赖兼容性或实时性能。详见 [local-environment.json](../research/local-environment.json)。

本轮仅保存仓库元数据、目录树、README 与选定文本源码，全部在 `D:\Desktop\FlyPet\research`。未下载脑数据、3D 大型资产或模型权重；未安装依赖；未运行候选项目。源码快照是研究材料，不是已经接入的产品代码。

后续执行前需要将 npm/Electron、pip/uv、模型框架缓存、TEMP/TMP 及应用运行数据明确指向工作区内目录；不照抄上游会写入默认用户缓存的安装命令。优先复用已有运行时，新增依赖按实际需要装到工作区。

本报告的能力判断基于固定提交的源码阅读和作者报告，尚不代表本机实测通过。

