# 果蝇视觉还原：官方模型、生物学依据与设计方向

> 研究资料与历史方案依据，不是新的实施任务清单。官方预训练模型现已接入独立观察，见 [12](12-official-vision-results.md)；不自行重建生理机制的约束继续有效。

调研日期：2026-09-19。用户要求：尽可能还原果蝇视觉，暂不以本机算力作为删减理由。**本轮为资料调研和方案依据整理，未修改运行中的模型或个体存档。**

### 最新实施约束：以已有模型为准

用户进一步明确：团队不是生物学专业，不自行拼造一套视觉生理机制。后续优先使用作者原始实现、预训练参数和官方实验；先复现，再集成。本文各生物学机制是理解模型边界的依据，不是必须由我们自行实现的功能清单。此前关于自建混合动力学/重建感光生理的建议不作为当前实施路线。

当前优先目标为官方 flyvis 的明暗与运动视觉。保持模型内部实现和参数不变；自行编写桌面取帧、坐标/时间接口、可视化和身体控制。全脑连接组本身没有保证的视觉识别能力；颜色、逼近决策和食物学习不从其他论文中抽取几条规则后宣称已还原。模型间接口仍是需要验证的工程假设，应单独标明。

## 1. 结论

当前瓶颈不仅是画面粗糙，而是视觉前端的空间、时间、细胞动力学和突触符号均被大幅简化。应把视觉作为一个有生物学约束的感觉系统重新建设，不能仅增加采样点后宣布视觉已还原。

建议保留当前全脑解剖图与身体框架，以官方 flyvis 为运动视觉的可复现参照，逐步建立**光学/眼柱采样 → 光转导与适应 → 分类型早期视觉动力学 → 运动、颜色、逼近通路 → 全脑读出**。这些是本次资料支持的设计建议，尚非已实现功能。

最关键的三项修正：

1. 不再把所有感受器和早期视觉细胞统一变成接收随机刺激的同参数 LIF 单元。
2. 对组胺及其他受体相关突触核对作用符号，不能把连接文件的通用正负标签直接等同于生理效应。
3. 明确真实眼柱几何、细胞感受野和时间响应，取消左右各 9×7 格对完整输入空间的压缩。

之前全脑实测验证的是完整图的计算可行性和程序因果链，不构成视觉生物学有效性的证明。这项性能结论仍然成立，但不能代替本轮的感觉模型工作。

## 2. 官方项目实际提供了什么

| 来源 | 核实内容 | 在 FlyPet 中的定位 |
|---|---|---|
| Shiu 脑模型及论文 [S1] | 连接组上的简化 LIF、指定细胞刺激/沉默与传感运动研究 | 全脑动力学参照；不是现成光学眼睛或完整视觉前端 |
| FlyWire 视觉部件清单 [S2] | 视叶细胞类型、连接与空间组织；配套官方注释仓库 | 真实细胞身份、眼柱、通路和空间映射的依据 |
| flyvis 官方实现与论文 [S3–S5] | 运动通路的连接组约束动态模型、已训练参数和响应实验 | 首先复现其运动视觉结果，作为我们的参考系统 |
| FlyGym/NeuroMechFly [S6] | 双眼场景渲染、鱼眼处理、复眼读出和身体感觉闭环 | 眼睛与身体/环境几何耦合的参考，不直接当作完整视觉生理模型 |

### flyvis 的能力与范围必须说准

论文模型包含 **45669 个模型单元、1513231 条连接、64 种细胞类型、721 个六角眼柱**，主要针对右眼中央视野的运动通路。它由局部重建拼接、平铺成共识连接图，不是我们当前 FAFB 全脑逐个 root ID 的同一张图。[S3]

其关键机制是连续电位、渐变化学突触；参数受到连接结构约束，并经过光流任务优化。它不能只靠导入连接数量、使用随机参数就获得论文中的响应。这个参考系统本身也有简化，不能代表完整颜色、偏振或整脑视觉。[S3]

官方源码进一步确认：默认 `PPNeuronIGRSynapses` 使用被动点神经元和瞬时渐变释放，默认非线性为 ReLU；`ConnectomeFromAvgFilters` 配置使用 `fib25-fib19_v2.2.json`、extent 15。标准视频刺激接口是单通道输入，不能据“含 R7/R8 名称”推断已经建好完整色觉。[S4]

官方提供明暗闪光、移动边缘、方向选择性和自定义刺激教程，可作为实际验收入口。预训练下载脚本存在；本轮仅查阅脚本和配置，**没有下载权重、安装 flyvis 或宣称已复现其结果**。[S5]

### FlyGym 的复眼也有明确建模假设

当前 API 提供双眼鱼眼校正图像及 yellow/pale 类型读出。旧版官方教程采用每眼 721 个采样区，并用绿色/蓝色图像通道近似两类小眼输入；教程将视野参数作为模型假设。它适合参考几何流程，不能把这种 RGB 近似直接等同于真实光谱感受器。[S6]

当前 FlyGym 2.x 与旧教程 API 不兼容；未来实现以所选固定版本源码为准，不混用旧示例命令。

## 3. 生物学要求如何落实到软件

### 3.1 复眼是有光学结构的采样系统

小眼、感受器与下游眼柱需要区分。神经叠加结构中，来自不同小眼、观察相近空间位置的 R1–R6 会汇入共同的 lamina cartridge；不能把“一个六边形”简单等同于一个神经元，或让全部八类感受器只复制同一灰度数字。[S7]

设计含义：每个视觉采样单元要有视轴、角度范围和空间敏感度；按感受野对邻域光线积分，而非读取一个像素。脑内眼柱 p/q 坐标是空间拓扑线索，**不是已经测量好的每个小眼光轴方向**，从眼柱坐标到光学视轴仍需有来源的几何模型。

对桌面世界的建议：把屏幕定义为有坐标尺度的发光平面，以身体位置、头部方向、飞行高度和双眼姿态决定投影。这样自运动引起的视野变化来自几何，不再通过人为修改神经活动伪造。不能让它默认获取整个桌面的全知式平面缩略图。

### 3.2 感光应有连续响应、适应和噪声

果蝇光感受器的实测输出包括连续变化的电位；光转导、膜动力学和背景亮度适应共同改变响应增益、速度与噪声。暗环境与亮环境不能只是用相同线性函数乘以不同像素值。[S8]

建议模型至少能表示：光谱加权输入、背景适应、非线性响应、时间滤波及有根据的噪声。更细的参考模型可表示微绒毛的量子事件和不应期采样机制，不因算力预先排除；是否采用逐微绒毛实现，应由目标响应和数据支持决定。[S9]

软件接口应输出电位/释放量或对应物理量，不先统一变成“每秒多少个强制脉冲”。需要在选定细胞边界再连接脉冲神经元，并对单位与时间常数做匹配。

### 3.3 组胺与受体决定的传递符号不可省略

光感受器的组胺传递及其氯离子通道受体，是早期视觉信号转换的重要基础。Ort/hclA、HisCl1 等受体的实验研究，说明这里不能简单假设“光越亮，所有后继细胞越兴奋”。[S10]

建议按有证据的细胞类型和受体重建符号与传递模型，并把化学突触与电耦合分开。这里需要修正的是模型生理解释，原始解剖接触数量与来源文件应保持可追溯。

### 3.4 ON/OFF 与运动方向要由有空间结构的通路计算

T4 和 T5 分别对移动的亮度增加/减少边缘表现出选择性，各自又有四个主要方向亚型。神经活动干预也会影响对应的运动反应。[S11]

T4/T5 的输入来自跨眼柱的具体回路，不能把邻近通路全部平均。Mi1/Tm3、Mi4/Mi9、CT1 等输入的分布和时间响应对 ON 路线有意义；OFF 路线有自己的结构，不能简单复制 ON 分支再翻一下符号。[S12]

设计目标：同一物体左右、上下移动，亮边缘和暗边缘，应得到不同的细胞群体响应。外部光流算法可以作为对照工具，但不能偷偷把算法算出的“向左”直接灌进神经元，然后宣称视觉通路自己发现了方向。

### 3.5 逼近检测要区别于一般变化

LPLC2 研究显示，径向向外运动与相反方向的抑制共同形成对逼近的选择性；收缩、整体平移、单纯亮度变化是重要的区别条件。其输出与 GF 逃逸路径相连。[S13]

因此“画面变化大就增加 threat”不足以代表逼近视觉。新链路应使一个逐渐扩张的暗物体与相同大小的横向移动物体引起不同反应。视觉验收中关闭现在的鼠标→LC4/LPLC2 直接注入；鼠标应作为世界中的可见物体进入画面。人工刺激保留为观察室实验工具。

### 3.6 色觉需要独立光谱通道和拮抗处理

R7/R8 的 pale/yellow 系统涉及不同的光谱敏感性，实验观察到感受器末端已存在 UV/蓝及 UV/绿相关的色拮抗。R7/R8 的直接互抑和间接反馈都是机制组成。[S14]

更大范围的相互作用还涉及 Dm9 等细胞，不能把颜色仅归结为两种孤立的像素阈值。[S15]

设计含义：保留 R1–R6 与 R7/R8 的不同输入模型，明确 pale/yellow/DRA 的标注来源。**当前本地类型表仅给出 R7、R8，没有个体级完整光谱亚型标注**；若补充亚型分布，需要记录其来自其他数据还是模型赋值，不能伪称都是这只标本测出来的。

RGB 截屏只包含三个显示通道，不包含原场景完整光谱或紫外信息。这是输入信息缺失，不是硬件性能限制。建议把“显示屏发出的光”和“视频里原本物体的反射光”区分开：前者可使用显示器光谱/虚拟原色模型，后者无法从普通 RGB 唯一恢复。先用可控的合成光谱刺激验证完整色觉机制，再明确 RGB 桌面模式采用何种近似；不把蓝通道直接冒充 UV。

### 3.7 视觉与身体自运动相互作用

果蝇实验报告了感受器光机械微运动与时空采样共同影响动态分辨率的现象。它说明复眼不只是固定马赛克，主动运动与感觉响应值得进入较完整模型。[S16]

但不要把人类眼球扫视动画直接贴到果蝇上。身体/头部转动与感受器内部微运动是不同层次；先依据对应实验模型实现可解释的耦合。

## 4. 对当前代码和数据的实查

本轮只读分析结果已保存到 [current-visual-audit.json](../research/vision/current-visual-audit.json)。

| 项目 | 当前事实 | 对还原目标的影响 |
|---|---|---|
| 原始眼柱表 | 左 785、右 796 个 column_id | 有比 63+63 格更完整的拓扑数据可用 |
| 感受器 | 配套全脑有 10616 个 R1–R6/R7/R8 | 当前仅映射 8753 个，其余不是已经获得正确视觉输入 |
| 空间输入 | 126 个标量共享给映射感受器 | 8753 个接入细胞不等于 8753 个独立视觉位置 |
| 时间输入 | 350 ms 采样间隔；2 ms 脑时间步 | 脑内部细步长无法补回未采到的画面变化 |
| 编码 | 灰度 → `3 + 45 × brightness` Hz 外部脉冲 | 无专门光转导、亮度适应、光谱分离 |
| 神经动力学 | 所有视觉细胞进入通用 LIF | 不符合上述早期渐变信号模型要求 |
| 感受器出边 | 39245 条正权重、18048 条负权重 | 正边占约 68.5%，按绝对权重计约 72.1%；不能作为早期组胺生理符号的可靠替代 |

正负比例来自本地配套文件的实际权重统计，不是论文报告的实验数据。它说明当前“忠实保留文件符号”与“忠实恢复视觉生理”是两回事；后续必须结合细胞/受体证据核对，而不是把这个比例称为生物学发现。

## 5. 推荐的实现路线

### 先建立参考系统

在工作区内复现官方 flyvis 预训练模型的标准闪光与移动边缘响应。先得到可以比对的时间曲线和方向选择性，不立即把模型参数移植到全脑就假定结果相同。

### 然后实现 FlyPet 的眼睛与早期视觉

保留真实眼柱空间拓扑，建立有物理解释的视轴、感受野与屏幕几何；以生理资料约束连续感光、适应及组胺传递。并行保留运动与光谱通路的表达能力，避免先做一个无法容纳色觉的灰度接口。

### 最后把视觉区域接回全脑

目标是同一张完整脑图上的分类型混合动力学：合适的细胞使用连续电位/渐变释放，其他细胞使用匹配的脉冲或动力学模型。可借鉴 flyvis 的类型参数与建模方式，但移植到 FAFB 个体连接图后必须重新检查响应。

flyvis 的共识格点不与全脑 root ID 一一等价。若初期先用官方视觉网络作为子系统，必须明确替代的细胞和输出边界，禁止同时保留旧视觉单元再把第二份输出叠加，导致重复计算同一感觉通路。采用外部视觉子系统时也不能继续宣称它就是原标本逐细胞的完整生理模拟。

当前不以本机资源为前提剪枝或压缩眼柱。时间步应按模型响应与数值收敛确定，并区分三个时钟：屏幕/视频新帧、身体运动产生的视网膜重采样、神经积分。提高神经采样率不能凭空恢复视频帧间未知运动；身体自身移动则可以在保持的世界图像上产生新的视网膜输入。

## 6. 少量但决定性的验收场景

| 刺激 | 要看到的证据 |
|---|---|
| 不同背景亮度下的闪光/阶跃 | 感受器适应、增益和时间响应有可解释变化 |
| 亮/暗边缘向四方向移动 | T4/T5 的对比极性与方向选择性，而非所有群体一起亮 |
| 扩张、收缩、整体平移、均匀变暗 | 逼近相关群体能区分这些刺激，GF 行为读出具有来源 |
| 有定义的光谱刺激，控制 R1–R6 驱动 | R7/R8 与相关回路出现符合机制的色拮抗，不以人眼等亮替代果蝇等效输入 |
| 静止场景中移动身体/头部 | 视网膜变化与姿态一致，并能与外部物体运动相区分地分析 |

这些用于判断模型是否值得接入，不要求开展一套新论文规模的实验。之后再测试网页滚动、视频和鼠标的实际体验。

## 7. 一个需要避免的跨物种误读

本次也查到 2026 年《Nature Communications》的高频视觉研究，报告约 1000 Hz 的条件性带宽和高频传递机制。**其主要实验对象是家蝇 Musca domestica，不是当前 FlyPet 对应的黑腹果蝇 Drosophila melanogaster**。可作为机制启发，不能直接把该频率写成果蝇固定“帧率”。[S17]

同样，旧论文中的单个角度、反应时间或频率往往依赖亮度、温度、刺激和个体，不能不加条件设为所有状态的常数。

## 8. 主要资料索引

以下关键依据优先采用作者官方代码、原始研究和项目文档；综述仅用于查找原始文献。

- **[S1] Shiu et al., 2024, Nature.** A Drosophila computational brain model reveals sensorimotor processing. [论文](https://doi.org/10.1038/s41586-024-07763-9)；[作者代码](https://github.com/philshiu/Drosophila_brain_model)。本轮结合既有本地 model.py 核对，出版社全文入口受限，不声称本轮完成其全文重读。
- **[S2] Matsliah et al., 2024, Nature.** Neuronal parts list and wiring diagram for a visual system. [论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446827/)；[作者注释仓库](https://github.com/murthylab/visual-system-parts-list)。
- **[S3] Lappalainen et al., 2024, Nature.** Connectome-constrained networks predict neural activity across the fly visual system. [论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC11525180/)；[DOI](https://doi.org/10.1038/s41586-024-07939-3)。已通过 Europe PMC 全文 XML 阅读方法与结果，并保存文本快照。
- **[S4] flyvis 作者实现。** [仓库](https://github.com/TuragaLab/flyvis)、[固定提交动力学](https://github.com/TuragaLab/flyvis/blob/92b3845cc426dd309a1a0e1b3890156c42e14021/flyvis/network/dynamics.py)、[刺激接口](https://github.com/TuragaLab/flyvis/blob/92b3845cc426dd309a1a0e1b3890156c42e14021/flyvis/network/stimulus.py)。相关配置和脚本已保存到 research/vision。
- **[S5] flyvis 官方教程。** [移动边缘](https://turagalab.github.io/flyvis/examples/04_flyvision_moving_edge_responses/)、[自定义刺激](https://turagalab.github.io/flyvis/examples/07_flyvision_providing_custom_stimuli/)、[版本发布](https://github.com/TuragaLab/flyvis/releases)。
- **[S6] FlyGym/NeuroMechFly。** [当前模拟 API](https://neuromechfly.org/api_reference/flygym/simulation/)、[旧版视觉教程](https://flygym.readthedocs.io/latest/tutorials/vision_basics.html)、[2024 年论文](https://doi.org/10.1038/s41592-024-02497-y)。旧教程用于核对模型假设，不作为当前 API 安装手册。
- **[S7] The Developmental Rules of Neural Superposition in Drosophila, 2015.** [原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4646663/)。用于神经叠加的光学/连接关系。
- **[S8] Juusola & Hardie, 2001, JGP.** Light Adaptation in Drosophila Photoreceptors I. [原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC2232468/)。用于连续电位、适应和响应速度。
- **[S9] Random Photon Absorption Model Elucidates How Early Gain Control in Fly Photoreceptors Arises from Quantal Sampling, 2016.** [原始建模研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4919358/)。用于微绒毛采样和增益控制参考。
- **[S10] Pantazis et al., 2008, J Neurosci.** Distinct Roles for Two Histamine Receptors (hclA and hclB) at the Drosophila Photoreceptor Synapse. [原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC6670387/)；另见 [Gengs et al., 2002](https://doi.org/10.1074/jbc.M207133200)。
- **[S11] Maisak et al., 2013, Nature.** A directional tuning map of Drosophila elementary motion detectors. [原始论文摘要](https://pubmed.ncbi.nlm.nih.gov/23925246/)。
- **[S12] Takemura et al., 2017 / Shinomiya et al., 2019, eLife.** [ON 回路](https://elifesciences.org/articles/24394)；[ON/OFF 通路比较](https://elifesciences.org/articles/40025)。
- **[S13] Klapoetke et al., 2017, Nature.** Ultra-selective looming detection from radial motion opponency. [原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC7457385/)。全文 XML 已保存。
- **[S14] Schnaitmann et al., 2018, Cell 172:318–330.e18.** Color Processing in the Early Visual System of Drosophila. [作者机构论文页](https://pure.mpg.de/pubman/item/item_2548018)；[DOI](https://doi.org/10.1016/j.cell.2017.12.018)。
- **[S15] Circuit mechanisms underlying chromatic encoding in Drosophila photoreceptors.** [原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC6981066/)。另见 [2024 年 Dm9 实验](https://pmc.ncbi.nlm.nih.gov/articles/PMC11133737/)。本轮部分 PMC 页面有访问限制，使用可检索的原论文摘要/作者页面，不声称全部阅读全文。
- **[S16] Juusola et al., 2017, eLife.** Microsaccadic sampling of moving image information provides Drosophila hyperacute vision. [原始研究](https://elifesciences.org/articles/26117)。
- **[S17] Mansour et al., 2026, Nature Communications.** Synaptic high-frequency jumping synchronises vision to high-speed behaviour. [原始研究](https://www.nature.com/articles/s41467-026-72509-2)。家蝇证据，与果蝇参数分开。

本轮没有安装新模型、下载预训练权重或更改正式运行；所有本地调研材料位于项目 research/vision。

