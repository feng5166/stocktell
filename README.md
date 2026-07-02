# 🧭 项目内核(所有人必读:技术 / 产品 / 美术)

> **StockTell 要做「AI 时代的 Bloomberg」——不是股票软件,是「产业理解工具」。**
> **核心竞争力 = 把「事件 → 产业链 → 个股影响」串成一条可核实、可推演的因果链。第一条:绝不做新闻聚合。**

别人给"发生了什么"(新闻/行情堆叠);我们做**推理**:一个事件如何**逐跳**沿产业链传导,最终落到具体受益个股。

**这才是"推理"(范式例子,牢记):**
```
OpenAI 发布 GPT-6
   ↓ 推理成本下降
   ↓ 算力 / GPU 需求 ↑
   ↓ HBM(高带宽显存)
   ↓ 液冷(散热)
   ↓ 光模块(互联)
   ↓ 国内受益:海光 / 长电 / 中际旭创 …
```
从一个全球事件,**多跳**推演到国内受益标的——这是护城河,新闻聚合抄不走。

**交付三要素(每个场景尽量都给)**
1. **一句话判断** —— 结论先行(利好/利空谁、该盯什么),不是丢一堆数据让用户自己想。
2. **产业链热力** —— 一眼看到链条上哪些环节在升温 / 降温。
3. **可核实因果链** —— 每一跳有依据(来源/关系边/复盘),不编造,守保守合规。

**三条硬规矩(做任何功能/交互/视觉前自问)**
1. **它有没有强化这条链?** 只"多显示一条新闻/行情"就不做。
2. **落点永远是"对我(用户自选)的票意味着什么"**,不是泛泛市场资讯。
3. **可核实、不编造**,守保守合规。

**各角色怎么落地**
- **技术**:数据/检索都服务这条链——`chainEdges`(产业链关系边:方向+强弱+依据,是多跳推理的骨架)、「为什么动」(事件→真实来源)、联动雷达(跨市场传导)、个股页(事件+产业链位置+对我的影响)。新数据/接口先问"是否喂养这条链/这次推理"。
- **产品**:每屏给"一句话判断 + 这事对我的票的影响";信息架构围绕 事件→传导→个股,而非新闻时间流。
- **美术**:因果链与**产业链热力**一眼可读(方向/强弱/传导路径/冷热),而不是把新闻/行情堆成列表。

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
