<h1 align="center">navbar</h1>

<p align="center">对话节点导航条：侧边栏右缘横线节点串快速跳转 user 消息，悬停磁吸小山伸长、悬停预览、点击跳转</p>

<p align="center">
  <img src="https://badgen.net/badge/license/MIT/green" alt="license">
</p>

侧边栏右缘的等距节点串（每 user 消息一条横线节点）——峰值条跟随阅读位置、悬停磁吸小山伸长（39/30/21/15/9 设计比例，基线/峰值宽可经 CSS 变量调整）、悬停预览卡（6 行截断）、点击平滑滚动 + 品牌蓝高亮、始终显示全部历史、少于 2 条 user 消息自动隐藏。实现 dsh-external/issues#144 规格。形态：官方 **bundle 插件**（`dsh.bundle` + dshClient 通道，**纯浏览器端**，Node half 为空），0 patch。

## 效果

![navbar 节点导航条（左侧：阅读位置峰值条；右侧：悬停磁吸小山伸长）](docs/preview/navbar.png)

## 能力

| 功能 | 说明 |
|---|---|
| 节点导航条 | 侧边栏右缘纵向节点串，每 user 消息一条横线节点（3px 高、命中区 14px） |
| 跟随阅读位置 | 峰值条（39px 品牌蓝）随当前阅读位置移动 |
| 磁吸小山 | 鼠标进入导航条时，最近节点成为峰值，相邻节点按比例逐级递减伸长（39/30/21/15/9） |
| 悬停预览 | 悬停节点显示消息预览卡（6 行截断，对齐官方 HoverCard 视觉，右侧弹出） |
| 点击跳转 | 平滑滚动到对应消息 + 品牌蓝高亮环 |
| 全量历史 | 始终显示全部历史节点，超长会话由容器滚动承载 |
| 自动隐藏 | <2 条 user 消息或非对话页不显示 |

零数据通道依赖：只靠官方锚点属性（`data-time-hover-root`，0806 起 user 行）驱动，无轮询、无路由、无工具。

节点基线宽/峰值宽可通过 CSS 变量调整（挂在导航条容器上）：

```css
[data-dsh-navbar] {
  --dsh-navbar-base-w: 9px;  /* 基线宽 */
  --dsh-navbar-peak-w: 39px; /* 峰值宽（悬停/激活） */
}
```

## 安装

**推荐：git 源一行安装**（构建产物已入库，git 源不触发构建）：

```sh
dsh plugin --profile web add "github:vlln/dsh-navbar#main"
```

或本地目录（有源码时）：`git clone` 后 `cd dsh-navbar && dsh plugin --profile web add .`。

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

## 许可

MIT（与官方 deepseek-harness 一致）。
