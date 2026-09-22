import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: '易于上手',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Docusaurus 设计的初衷就是让安装和使用都简单,几分钟就能把文档站点跑起来。
      </>
    ),
  },
  {
    title: '聚焦内容',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Docusaurus 处理建站的杂活,你只要把 Markdown 文档放进 <code>docs</code> 目录。
      </>
    ),
  },
  {
    title: '基于 React',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        用 React 扩展或定制网站布局,同一套页头页脚可以复用,组件化让站点演进更可控。
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
