"use strict";(self.webpackChunkdocs_use_docusaurus=self.webpackChunkdocs_use_docusaurus||[]).push([["7801"],{32255(e,r,t){t.r(r),t.d(r,{assets:()=>c,contentTitle:()=>i,default:()=>l,frontMatter:()=>a,metadata:()=>s,toc:()=>o});var s=t(19409),u=t(65813),n=t(52244);t(45970),t(15345),t(6324);let a={title:"\u5728 Docusaurus MDX \u4E2D\u4F7F\u7528 ReactLive \u7684\u6848\u4F8B",authors:["cbtpro"],description:"\u5C55\u793A\u5982\u4F55\u5728 Docusaurus \u7684 MDX \u535A\u5BA2\u4E2D\u901A\u8FC7 ReactLive \u7EC4\u4EF6\u4EA4\u4E92\u5F0F\u6F14\u793A TypeScript \u4EE3\u7801",tags:["docusaurus","react-live","typescript","\u7EC4\u4EF6"]},i="\u5728 MDX \u91CC\u4F7F\u7528 ReactLive \u7684\u6848\u4F8B",c={authorsImageUrls:[void 0]},o=[];function d(e){let r={code:"code",p:"p",...(0,n.R)(),...e.components};return(0,u.jsxs)(r.p,{children:["\u4F60\u53EF\u4EE5\u5728 Docusaurus \u7684 MDX \u6587\u4EF6\u4E2D\u8FD9\u6837\u4F7F\u7528 ",(0,u.jsx)(r.code,{children:"ReactLive"})," \u7EC4\u4EF6\uFF0C\u5B9E\u73B0\u4EE3\u7801\u7247\u6BB5\u548C\u8FD0\u884C\u7ED3\u679C\u7684\u4E92\u52A8\u6F14\u793A\u3002"]})}function l(e={}){let{wrapper:r}={...(0,n.R)(),...e.components};return r?(0,u.jsx)(r,{...e,children:(0,u.jsx)(d,{...e})}):d(e)}},45970(e,r,t){t.d(r,{A:()=>n});var s=t(65813),u=t(63394);function n(){let e=`function App() {
  function add(...args: number[]) {
    return args.reduce((a, b) => a + b, 0);
  }
  return (<div>{add(1, 2, 3)}</div>)
}`;return(0,s.jsx)(u.A,{code:e,liveProps:{language:"ts",noInline:!1,typescript:!0}})}},15345(e,r,t){t.d(r,{A:()=>n});var s=t(65813),u=t(63394);function n(){let e=`
    function App() {
      function add(...args: number[]) {
        let sum = Array.isArray(args) ? args.reduce((a, b) => a + b, 0) : 0;
        function inner(...next: number[]) {
          sum += Array.isArray(next) ? next.reduce((a, b) => a + b, 0) : 0;
          return inner;
        }
        inner.valueOf = () => sum;
        inner.toString = () => sum.toString();
        return inner;
      }
      return (<div>{+add(1)(2)(3)}</div>);
    }
  `;return(0,s.jsx)(u.A,{code:e,liveProps:{language:"ts",noInline:!1,typescript:!0}})}},6324(e,r,t){t.d(r,{A:()=>n});var s=t(65813),u=t(63394);function n(){let e=`
    function App() {
      function add(...args: number[]) {
        let sum = Array.isArray(args) ? args.reduce((a, b) => a + b, 0) : 0;
        function inner(...next: number[]) {
          sum += Array.isArray(next) ? next.reduce((a, b) => a + b, 0) : 0;
          return inner;
        }
        inner.valueOf = () => sum;
        inner.toString = () => sum.toString();
        return inner;
      }
      return <div>{+add(1, 2)(3)}</div>;
    }
  `;return(0,s.jsx)(u.A,{code:e,liveProps:{language:"ts",noInline:!1,typescript:!0}})}},63394(e,r,t){t.d(r,{A:()=>n});var s=t(65813);t(59729);var u=t(20671);function n({code:e,liveProps:r={}}){return(0,s.jsxs)(u.Q,{code:e,...r,children:[(0,s.jsx)(u.w,{}),(0,s.jsx)(u.p1,{}),(0,s.jsxs)("div",{children:[(0,s.jsx)("strong",{children:"\u8F93\u51FA\u7ED3\u679C\uFF1A"}),(0,s.jsx)(u.pA,{})]})]})}},19409(e){e.exports=JSON.parse('{"permalink":"/docs-use-docusaurus/blog/2025/08/19/react-live-post","editUrl":"https://github.com/cbtpro/docs-use-docusaurus/tree/main/blog/blog/2025-08-19-react-live-post.md","source":"@site/blog/2025-08-19-react-live-post.md","title":"\u5728 Docusaurus MDX \u4E2D\u4F7F\u7528 ReactLive \u7684\u6848\u4F8B","description":"\u5C55\u793A\u5982\u4F55\u5728 Docusaurus \u7684 MDX \u535A\u5BA2\u4E2D\u901A\u8FC7 ReactLive \u7EC4\u4EF6\u4EA4\u4E92\u5F0F\u6F14\u793A TypeScript \u4EE3\u7801","date":"2025-08-19T00:00:00.000Z","tags":[{"inline":false,"label":"Docusaurus","permalink":"/docs-use-docusaurus/blog/tags/docusaurus","description":"Docusaurus tag description"},{"inline":false,"label":"React Live","permalink":"/docs-use-docusaurus/blog/tags/react-live","description":"React Live tag description"},{"inline":false,"label":"TypeScript","permalink":"/docs-use-docusaurus/blog/tags/typescript","description":"TypeScript tag description"},{"inline":false,"label":"\u7EC4\u4EF6","permalink":"/docs-use-docusaurus/blog/tags/\u7EC4\u4EF6","description":"\u7EC4\u4EF6 tag description"}],"readingTime":2.04,"hasTruncateMarker":true,"authors":[{"name":"cbtpro","title":"Front End Engineer","url":"https://github.com/cbtpro","imageURL":"https://github.com/cbtpro.png","key":"cbtpro","page":null}],"frontMatter":{"title":"\u5728 Docusaurus MDX \u4E2D\u4F7F\u7528 ReactLive \u7684\u6848\u4F8B","authors":["cbtpro"],"description":"\u5C55\u793A\u5982\u4F55\u5728 Docusaurus \u7684 MDX \u535A\u5BA2\u4E2D\u901A\u8FC7 ReactLive \u7EC4\u4EF6\u4EA4\u4E92\u5F0F\u6F14\u793A TypeScript \u4EE3\u7801","tags":["docusaurus","react-live","typescript","\u7EC4\u4EF6"]},"unlisted":false,"prevItem":{"title":"ReactJS \u7EC4\u4EF6\u5F00\u53D1\u6700\u4F73\u5B9E\u8DF5 \u2014 \u4ECE\u751F\u547D\u5468\u671F\u5230\u865A\u62DF\u5217\u8868","permalink":"/docs-use-docusaurus/blog/2026/07/29/virtual-list"},"nextItem":{"title":"\u5728 Docusaurus MDX \u91CC\u4F7F\u7528 Vue \u7EC4\u4EF6","permalink":"/docs-use-docusaurus/blog/2025/07/08/use-vue-blog-post"}}')}}]);