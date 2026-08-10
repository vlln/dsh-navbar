# @dsh-external/dsh-navbar

对话节点导航条：对话区右缘的**等距节点串**（每 user 消息一节点）——激活药丸跟随阅读位置、悬停玻璃预览卡（6 行截断）、点击平滑滚动 + 品牌蓝高亮环、超过 11 节点自动滑动窗口、平时隐形悬停浮现、少于 2 条 user 消息自动隐藏。实现 dsh-external/issues#144 规格。

形态：官方 **bundle 插件**（`dsh.bundle` + dshClient 通道，**纯浏览器端**，Node half 为空），经 `dsh plugin --profile web add` 挂载，0 patch。

## 能力

| 功能 | 说明 |
|---|---|
| 节点导航条 | 对话区右缘纵向节点串，每 user 消息一个圆点节点 |
| 跟随阅读位置 | 激活药丸（22px 品牌蓝胶囊）随当前阅读位置移动 |
| 悬停预览 | 悬停节点显示消息预览卡（6 行截断，对齐官方 HoverCard 视觉） |
| 点击跳转 | 平滑滚动到对应消息 + 品牌蓝高亮环 |
| 滑动窗口 | >11 节点时只显示窗口内节点（避免溢出） |
| 自动隐藏 | <2 条 user 消息或非对话页不显示 |

零数据通道依赖：只靠官方锚点属性（`data-time-hover-root`，0806 起 user 行）驱动，无轮询、无路由。

## 安装

```sh
# 本地目录
dsh plugin --profile web add <此仓库路径>

# git 源（需本地可解析；见 dsh-loop README 的依赖说明）
dsh plugin --profile web add git+file:///<此仓库路径>#<commit>
```

装完 **重启 web** 生效；设置页「插件」面板可停用/启用。

## 使用

安装即用，无命令、无工具。对话页（Chat 视图）右缘出现节点条；悬停看预览、点击跳转。`prefers-reduced-motion` 下禁用动画。

## 开发

```sh
pnpm install
pnpm run build      # tsdown：client bundle (lib/client.js)
```

- client：`src/client/index.ts`（自渲染 DOM + 官方锚点契约，无 React 依赖）
- Node half：`src/index.mjs`（空 apply，bundle 挂载载体）
- 构建产物 `lib/` 不入库

## 许可

BSD-3-Clause（dsh-external 生态示例插件）。
