# 学习专项资料

日期：2026-09-19。结论见 [学习调研报告](../../docs/16-learning-literature-and-options.md)。

- `repositories.json`：本轮 GitHub API 返回的 star、许可标识、提交版本和查询错误；不代表已复现实验。
- 各 `tree.json`：对应提交的文件清单，用于判断代码、模型权重及示例是否提供。
- `InsectRobotics__IncentiveCircuit/circuit.py`：作者源码参考，取自该目录 `tree.json` 的提交；保留原作者及 GPLv3+ 头部。未并入产品，也未执行。[上游许可](https://github.com/InsectRobotics/IncentiveCircuit/blob/1610c80072fe8bb59bd397e7a61f716393a509b9/LICENSE)。
- 个别目录中的 `LICENSE`：获取到的上游许可文件。
- `inspect_repositories.py`：只读获取资料的辅助脚本。默认走 Clash 7897；`--direct --metadata-only` 是本轮实际成功的元数据查询方式。API 匿名限流时不反复重试。

其余已阅读源码通过报告内的 GitHub 原始链接访问；此目录不是完整源码镜像。没有下载训练集、神经数据或新增环境。所有实际保存的下载文件均在此工作区。
