# 🧭 项目内核(所有人必读:技术 / 产品 / 美术)

> **StockTell 的核心竞争力 = 把「事件 → 产业链 → 个股影响」串成一条可核实的因果链。不是新闻聚合。**
>
> 一句话:别人给"发生了什么"(新闻/行情堆叠),我们给"这事顺着产业链传导下来、对你手里的票意味着什么"。

**为什么这是壁垒**:新闻聚合、行情罗列是红海,人人可做、无护城河。我们的护城河 = 产业链关系图谱(谁供货谁/对标谁)+ 事件溯源 + 落到个股的因果解读 + 懂用户的票。这条「事件→产业链→个股」的链,别人抄不走。

**三条硬规矩(做任何功能/交互/视觉前自问)**
1. **它有没有强化这条链?** —— 让"某事件如何沿产业链传导、最终影响哪只票"更清晰/可信/个性化。若只是"多显示一条新闻/行情",不做。
2. **落点永远是"对我的票意味着什么"** —— 不是泛泛市场资讯,是用户自选/关注的票。
3. **可核实、不编造** —— 因果链每一环都要有依据(来源/关系边/复盘数据),守保守合规。

**各角色怎么落地**
- **技术**:数据模型与检索都服务这条链——`chainEdges`(产业链关系边:方向+强弱+依据)、「为什么动」(事件→真实来源溯源)、联动雷达(跨市场传导)、个股页(事件+产业链位置+对我的影响)。新数据/接口先问"是否喂养这条链"。
- **产品**:每个页面/模块回答"这事对我的票意味着什么";信息架构围绕 事件→传导→个股,而非新闻时间流。
- **美术**:视觉让因果链**一眼可读**——方向(上下游)、强弱、传导路径清晰呈现,而不是把新闻/行情堆成列表。

**⚠️ 反面清单(警惕做成这些)**:纯新闻 feed、纯行情看板、资讯聚合器、"什么都报但不解释对我的票的影响"。

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 项目文档

- [外部服务清单 `docs/EXTERNAL_SERVICES.md`](docs/EXTERNAL_SERVICES.md) — 所有第三方/自建服务、环境变量总表、关键文件与坑。
  **新增任何外部服务前先查阅、接入后立即更新本文档。**

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
