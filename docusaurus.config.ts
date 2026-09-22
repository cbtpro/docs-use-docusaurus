import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import useVuePlugin from './plugins/use-vue';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Reactjs最佳实践',
  tagline: '记录中后台 CRUD 之外的工程细节',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: process.env.SITE_URL || 'https://docs-use-docusaurus.vercel.app/',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: process.env.BASE_URL || '/',
  trailingSlash: true,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'cbtpro',
  projectName: 'docs-use-docusaurus',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/cbtpro/docs-use-docusaurus/tree/main/docs',
        },
        blog: {
          blogSidebarTitle: '全部博客',
          blogSidebarCount: 'ALL',
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/cbtpro/docs-use-docusaurus/tree/main/blog',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Reactjs最佳实践',
      logo: {
        alt: 'Reactjs最佳实践 Logo',
        src: 'img/logo.svg',
      },
      items: [
          {
            type: 'doc',
            docId: 'intro',
            position: 'left',
            label: '教程介绍',
          },
          {
            to: '/blog',
            label: '博客',
            position: 'left'
          },
          {
            href: 'https://docs-use-vuepress.vercel.app/',
            label: 'vue',
            position: 'left'
          },
          {
            href: 'https://blog.chenbitao.com/',
            label: '个人博客',
            position: 'right'
          },
          {
            href: 'https://github.com/cbtpro/docs-use-docusaurus',
            label: 'GitHub',
            position: 'right',
          },
        ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '文档',
          items: [
            {
              label: '教程介绍',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: '社区',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
            },
            {
              label: 'Discord',
              href: 'https://discordapp.com/invite/docusaurus',
            },
            {
              label: 'X',
              href: 'https://x.com/docusaurus',
            },
          ],
        },
        {
          title: '更多',
          items: [
            {
              label: '博客',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/cbtpro',
            },
          ],
        },
      ],
        copyright: `版权所有 © ${new Date().getFullYear()} cbtpro, Inc. 基于 Docusaurus 构建。`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    algolia: {
      // The application ID provided by Algolia
      appId: 'C9RWL0KQEO',

      // Public API key: it is safe to commit it
      apiKey: 'e8977bac75027268be34cf0ebb5164ba',

      indexName: 'docs-use-docusaurus',

      // Optional: see doc section below
      contextualSearch: true,
    },
  } satisfies Preset.ThemeConfig,
  // 加载插件列表
  plugins: [useVuePlugin],
};

export default config;
