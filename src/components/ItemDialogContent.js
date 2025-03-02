import React, { Fragment, useContext, useEffect, useState } from 'react';
import SvgIcon from '@material-ui/core/SvgIcon';
import StarIcon from '@material-ui/icons/Star';
import KeyHandler from 'react-key-handler';
import _ from 'lodash';
import OutboundLink from './OutboundLink';
import millify from 'millify';
import relativeDate from 'relative-date';
import formatNumber from '../utils/formatNumber';
import isParent from '../utils/isParent';
import InternalLink from './InternalLink';
import fields from '../types/fields';
import isGoogle from '../utils/isGoogle';
import settings from 'public/settings.json';
import {Bar, Pie, defaults} from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import classNames from 'classnames'
import CreateWidthMeasurer from 'measure-text-width';
import assetPath from '../utils/assetPath'
import { stringifyParams } from '../utils/routing'
import LandscapeContext from '../contexts/LandscapeContext'
import Head from 'next/head'
import useWindowSize from '../utils/useWindowSize'

const closeUrl = params => stringifyParams({ mainContentMode: 'card-mode', selectedItemId: null, ...params })

let productScrollEl = null;
const formatDate = function(x) {
  if (x.text) {
    return x.text;
  }
  return relativeDate(new Date(x));
};

function getRelationStyle(relation) {
  const relationInfo = fields.relation.valuesMap[relation]
  if (relationInfo && relationInfo.color) {
    return {
      border: '4px solid ' + relationInfo.color
    };
  } else {
    return {};
  }
}


const linkTag = (label, { name, url = null, color = 'blue', multiline = false }) => {
  return (<InternalLink to={url || '/'} className={`tag tag-${color} ${multiline ? 'multiline' : ''}`}>
    {(name ? <span className="tag-name">{name}</span> : null)}
    <span className="tag-value">{label}</span>
  </InternalLink>)
}

const parentTag = (project) => {
  const membership = Object.values(settings.membership).find(({ crunchbase_and_children }) => {
    return isParent(crunchbase_and_children, project)
  });

  if (membership) {
    const { label, name, crunchbase_and_children } = membership;
    const slug = crunchbase_and_children.split("/").pop();
    const url = closeUrl({ grouping: 'organization', filters: {parents: slug}})
    return linkTag(label, {name, url});
  }
}

const projectTag = function({relation, isSubsidiaryProject, project, ...item}) {
  if (relation === false) {
    return null;
  }
  const { prefix, tag } = fields.relation.valuesMap[project] || {};

  if (prefix && tag) {
    const url = closeUrl({ filters: { relation: project }})
    return linkTag(tag, {name: prefix, url })
  }

  if (isSubsidiaryProject) {
    const url = closeUrl({ mainContentMode: 'card-mode', filters: { relation: 'member', organization: item.organization }})
    return linkTag("Subsidiary Project", { name: settings.global.short_name, url });
  }
  return null;
};

const memberTag = function({relation, member, enduser}) {
  if (relation === 'member' || relation === 'company') {
    const info = settings.membership[member];
    //const name = info.name;
    const label = enduser //? (info.end_user_label || info.label) : info.label ;
    if (!label) {
      return null;
    }
    const url = closeUrl({ filters: { relation }})
    return linkTag(label, {name: name, url });
  }
  return null;
}

const openSourceTag = function(oss) {
  if (oss) {
    const url = closeUrl({ grouping: 'license', filters: {license: 'Open Source'}})
    return linkTag("Open Source Software", { url, color: "orange" });
  }
};

const licenseTag = function({relation, license, hideLicense}) {
  const { label } = _.find(fields.license.values, {id: license});
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const width = CreateWidthMeasurer(window).setFont('0.6rem Roboto');
    setWidth(width)
  }, [label])

  if (relation === 'company' || hideLicense) {
    return null;
  }

  const url = closeUrl({ grouping: 'license', filters: { license }});
  return linkTag(label, { name: "License", url, color: "purple", multiline: width > 90 });
}
const badgeTag = function(itemInfo) {
  if (settings.global.hide_best_practices) {
    return null;
  }
  if (!itemInfo.bestPracticeBadgeId) {
    if (itemInfo.oss) {
      const emptyUrl="https://bestpractices.coreinfrastructure.org/";
      return (<OutboundLink to={emptyUrl} className="tag tag-grass">
        <span className="tag-value">No CII Best Practices </span>
      </OutboundLink>);
    } else {
      return null;
    }
  }
  const url = `https://bestpractices.coreinfrastructure.org/en/projects/${itemInfo.bestPracticeBadgeId}`;
  const label = itemInfo.bestPracticePercentage === 100 ? 'passing' : (itemInfo.bestPracticePercentage + '%');
  return (<OutboundLink to={url} className="tag tag-grass">
    <span className="tag-name">CII Best Practices</span>
    <span className="tag-value">{label}</span>
  </OutboundLink>);
}

const chart = function(itemInfo) {
  const { params } = useContext(LandscapeContext)
  if (params.isEmbed || !itemInfo.github_data || !itemInfo.github_data.languages) {
    return null;
  }
  const callbacks = defaults.global.tooltips.callbacks;
  function percents(v) {
    const p = Math.round(v / total * 100);
    if (p === 0) {
      return '<1%';
    } else {
      return p + '%';
    }
  }
  const newCallbacks =  {...callbacks, label: function(tooltipItem, data) {
    const v = data.datasets[0].data[tooltipItem.index];
    const value =  millify(v, {precision: 1});
    const language = languages[tooltipItem.index];
    return `${percents(language.value)} (${value})`;
  }};
  /*{
    label: function(tooltipItem, data) {
      debugger
                    var label = data.datasets[tooltipItem.datasetIndex].label || '';

                    if (label) {
                        label += ': ';
                    }
                    label += Math.round(tooltipItem.yLabel * 100) / 100;
                    return label;
                }
  }; */
  const allLanguages = itemInfo.github_data.languages;
  const languages = (function() {
    const maxEntries = 7;
    if (allLanguages.length <= maxEntries) {
      return allLanguages
    } else {
      return allLanguages.slice(0, maxEntries).concat([{
        name: 'Other',
        value: _.sum( allLanguages.slice(maxEntries - 1).map( (x) => x.value)),
        color: 'Grey'
      }]);
    }
  })();
  const data = {
    labels: languages.map((x) => x.name),
    datasets: [{
      data: languages.map( (x) => x.value),
      backgroundColor: languages.map( (x) => x.color)
    }]
  };
  const total = _.sumBy(languages, 'value');

  function getLegendText(language) {
    return `${language.name} ${percents(language.value)}`;
  }

  const legend = <div style={{position: 'absolute', width: 170, left: 0, top: 0, marginTop: -5, marginBottom: 5, fontSize: '0.8em'  }}>
    {languages.map(function(language) {
      const url = language.name === 'Other' ? null : closeUrl({ grouping: 'no', filters: {language: language.name }});
      return <div key={language.name} style = {{
        position: 'relative',
        marginTop: 2,
        height: 12
      }} >
        <div style={{display: 'inline-block', position: 'absolute', height: 12, width: 12, background: language.color, top: 2, marginRight: 4}} />
        <div style={{display: 'inline-block', position: 'relative', width: 125, left: 16,  whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'}}>
          <InternalLink to={url}>{ getLegendText(language) } </InternalLink></div>
      </div>
    })}
  </div>

  return <div style={{width: 220, height: 120, position: 'relative'}}>
    <div style={{marginLeft: 170, width: 100, height: 100}}>
      <Pie height={100} width={100} data={data} legend={{display: false}} options={{tooltips: {callbacks: newCallbacks}}} />
    </div>
    { legend }
  </div>
}

const participation = function(itemInfo) {
  const { innerWidth } = window;
  const { params } = useContext(LandscapeContext)
  if (params.isEmbed || !itemInfo.github_data || !itemInfo.github_data.contributions) {
    return null;
  }
  let lastMonth = null;
  let lastWeek = null;
  const data = {
    labels: _.range(0, 51).map(function(week) {
      const firstWeek = new Date(itemInfo.github_data.firstWeek.replace('Z', 'T00:00:00Z'));
      firstWeek.setDate(firstWeek.getDate() + week * 7);
      const m = firstWeek.getMonth();
      if (lastMonth === null) {
        lastMonth = m;
        lastWeek = week;
      }
      else if (m % 12 === (lastMonth + 2) % 12) {
        if (week > lastWeek + 6) {
          lastMonth = m;
          lastWeek = week;
        } else {
          return '';
        }
      } else {
        return '';
      }
      const result = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m];
      return result;
    }),
    datasets: [{
      backgroundColor: 'darkblue',
      labels: [],
      data: itemInfo.github_data.contributions.split(';').map( (x)=> +x).slice(-51)
    }]
  };
  const callbacks = defaults.global.tooltips.callbacks;
  const newCallbacks =  {...callbacks, title: function(data) {
    const firstWeek = new Date(itemInfo.github_data.firstWeek.replace('Z', 'T00:00:00Z'));
    const week = data[0].index;
    firstWeek.setDate(firstWeek.getDate() + week * 7);
    const s = firstWeek.toISOString().substring(0, 10);
    return s;
  }};
  const options = {
    tooltips: {callbacks: newCallbacks},
    scales: {
      xAxes: [{
        gridLines: false,
        ticks: {
          backdropPaddingY: 15,
          autoSkip: false,
          minRotation: 0,
          maxRotation: 0
        },
        scaleLabel: {
          display: false
        }
      }],
      yAxes: [{
        ticks: {
          beginAtZero: true,
          callback: function (value) { if (Number.isInteger(value)) { return value; } }
        }
      }]
    }
  };
  const width = Math.min(innerWidth - 110, 300);
  return <div style={{width: width, height: 150, position: 'relative'}}>
    <Bar height={150} width={width} data={data} legend={{display: false}} options={options} />
    <div style={{
      transform: 'rotate(-90deg)',
      position: 'absolute',
      left: -24,
      fontSize: 10,
      top: 59
    }}>Commits</div>
  </div>;
}

function handleUp() {
  productScrollEl.scrollBy({top: -200, behavior: 'smooth'});
}
function handleDown() {
  productScrollEl.scrollBy({top: 200, behavior: 'smooth' });
}

const ItemDialogContent = ({ itemInfo, loading }) => {
  const { params } = useContext(LandscapeContext)
  const { onlyModal } = params
  const [showAllRepos, setShowAllRepos] = useState(false)
  const { innerWidth, innerHeight } = useWindowSize()

  const linkToOrganization = closeUrl({ grouping: 'organization', filters: {organization: itemInfo.organization}});
  const itemCategory = function(path) {
    var separator = <span className="product-category-separator" key="product-category-separator">•</span>;
    var subcategory = _.find(fields.landscape.values,{id: path});
    var category = _.find(fields.landscape.values, {id: subcategory.parentId});
    var categoryMarkup = (
      <InternalLink key="category" to={closeUrl({ grouping: 'landscape', filters: {landscape: category.id}})}>{category.label}</InternalLink>
    )
    var subcategoryMarkup = (
      <InternalLink key="subcategory" to={closeUrl({ grouping: 'landscape', filters: {landscape: path}})}>{subcategory.label}</InternalLink>
    )
    return (<span>{[categoryMarkup, separator, subcategoryMarkup]}</span>);
  }

  const firstCommitDateElement = itemInfo.firstCommitDate  && (
    <div className="product-property row">
      <div className="product-property-name col col-40">First Commit</div>
      <div className="product-property-value tight-col col-60">
        <OutboundLink to={itemInfo.firstCommitLink} >{formatDate(itemInfo.firstCommitDate)}</OutboundLink>
      </div>
    </div>
  );

  const contributorsCountElement =  itemInfo.contributorsCount ? (
                      <div className="product-property row">
                        <div className="product-property-name col col-40">Contributors</div>
                        <div className="product-property-value tight-col col-60">
                          <OutboundLink to={itemInfo.contributorsLink}>
                            {itemInfo.contributorsCount > 500 ? '500+' : itemInfo.contributorsCount }
                          </OutboundLink>
                        </div>
                      </div>
                    ) : null;

  const headquartersElement = itemInfo.headquarters && itemInfo.headquarters !== 'N/A' && (
    <div className="product-property row">
      <div className="product-property-name col col-40">Headquarters</div>
      <div className="product-property-value tight-col col-60"><InternalLink to={closeUrl({ grouping: 'headquarters', filters:{headquarters:itemInfo.headquarters}})}>{itemInfo.headquarters}</InternalLink></div>
    </div>
  );
  const amountElement = !loading && !settings.global.hide_funding_and_market_cap && Number.isInteger(itemInfo.amount) && (
    <div className="product-property row">
      <div className="product-property-name col col-40">{itemInfo.amountKind === 'funding' ? 'Funding' : 'Market Cap'}</div>
      {  itemInfo.amountKind === 'funding' &&
          <div className="product-property-value tight-col col-60">
            <OutboundLink to={itemInfo.crunchbase + '#section-funding-rounds'}>
              {'$' + millify(itemInfo.amount)}
            </OutboundLink>
          </div>
      }
      { itemInfo.amountKind !== 'funding' &&
          <div className="product-property-value tight-col col-60">
            <OutboundLink to={'https://finance.yahoo.com/quote/' + itemInfo.yahoo_finance_data.effective_ticker}>
              {'$' + millify(itemInfo.amount)}
            </OutboundLink>
          </div>
      }
    </div>
  );
  const tickerElement = itemInfo.ticker && (
    <div className="product-property row">
      <div className="product-property-name col col-40">Ticker</div>
      <div className="product-property-value tight-col col-60">
        <OutboundLink to={"https://finance.yahoo.com/quote/" + itemInfo.yahoo_finance_data.effective_ticker}>
          {itemInfo.yahoo_finance_data.effective_ticker}
        </OutboundLink>
      </div>
    </div>
  );
  const latestCommitDateElement =  itemInfo.latestCommitDate && (
    <div className="product-property row">
      <div className="product-property-name col col-50">Latest Commit</div>
      <div className="product-property-value col col-50">
        <OutboundLink to={itemInfo.latestCommitLink}>{formatDate(itemInfo.latestCommitDate)}</OutboundLink>
      </div>
    </div>
  );
  const releaseDateElement =  itemInfo.releaseDate && (
    <div className="product-property row">
      <div className="product-property-name col col-50">Latest Release</div>
      <div className="product-property-value col col-50">
        <OutboundLink to={itemInfo.releaseLink}>{formatDate(itemInfo.releaseDate)}</OutboundLink>
      </div>
    </div>
  );
  const crunchbaseEmployeesElement =  itemInfo.crunchbaseData && itemInfo.crunchbaseData.numEmployeesMin && (
    <div className="product-property row">
      <div className="product-property-name col col-50">Headcount</div>
      <div className="product-property-value col col-50">{formatNumber(itemInfo.crunchbaseData.numEmployeesMin)}-{formatNumber(itemInfo.crunchbaseData.numEmployeesMax)}</div>
    </div>
  );

  const scrollAllContent = innerWidth < 1000 || innerHeight < 630;
  const cellStyle = {
    width: 146,
    marginRight: 4,
    height: 26,
    display: 'inline-block',
    layout: 'relative',
    overflow: 'hidden'
  };

  const charts = <Fragment>
    {chart(itemInfo)}
    {participation(itemInfo)}
  </Fragment>

  const shortenUrl = (url) => url.replace(/http(s)?:\/\/(www\.)?/, "").replace(/\/$/, "");

  const productInfo = <Fragment>
              <div className="product-main">
                { (isGoogle() || onlyModal) ?
                  <React.Fragment>
                    <div className="product-name">{itemInfo.name}</div>
                    <div className="product-description">{itemInfo.description}</div>
                    <div className="product-parent"><InternalLink to={linkToOrganization}>{itemInfo.organization}</InternalLink></div>
                    <div className="product-category">{itemCategory(itemInfo.landscape)}</div>
                  </React.Fragment> :
                  <React.Fragment>
                    <div className="product-name">{itemInfo.name}</div>
                    <div className="product-parent"><InternalLink to={linkToOrganization}><span>{itemInfo.organization}</span>{memberTag(itemInfo)}</InternalLink></div>
                    <div className="product-category">{itemCategory(itemInfo.landscape)}</div>
                    <div className="product-description">{itemInfo.description}</div>
                  </React.Fragment>
                }
              </div>
              { !loading && <div className="product-properties">
                <div className="product-property row">
                  <div className="product-property-name col col-20">Website</div>
                  <div className="product-property-value col col-80">
                    <OutboundLink to={itemInfo.homepage_url}>{shortenUrl(itemInfo.homepage_url)}</OutboundLink>
                  </div>
                </div>
                { itemInfo.repos && itemInfo.repos.map(({ url, stars }, idx) => {
                  return <div className={`product-property row ${ idx < 3 || showAllRepos ? '' : 'hidden' }`} key={idx}>
                    <div className="product-property-name col col-20">
                      { idx === 0 && (itemInfo.repos.length > 1 ? 'Repositories' : 'Repository') }
                    </div>
                    <div className="product-property-value product-repo col col-80">
                      <OutboundLink to={url}>{shortenUrl(url)}</OutboundLink>

                      { idx === 0 && itemInfo.repos.length > 1 && <span className="primary-repo">(primary)</span> }

                    </div>
                  </div>
                })}
                {itemInfo.repos && itemInfo.repos.length > 1 &&
                <div className="product-property row">
                  <div className="product-property-name col col-20"></div>
                  <div className="product-property-value product-repo col col-80">
                    {itemInfo.repos && itemInfo.repos.length > 3 &&
                      <span>
                        <a href="#" onClick={() => setShowAllRepos(!showAllRepos)}>{ showAllRepos ? 'less...' : 'more...' }</a>
                      </span>
                    }
                    <span className="product-repo-stars-label">
                      total:
                    </span>
                  </div>
                </div>
                }
                {itemInfo.crunchbase &&
                <div className="product-property row">
                  <div className="product-property-name col col-20">Crunchbase</div>
                  <div className="product-property-value col col-80">
                    <OutboundLink to={itemInfo.crunchbase}>{shortenUrl(itemInfo.crunchbase)}</OutboundLink>
                  </div>
                </div>
                }
                {itemInfo.crunchbaseData && itemInfo.crunchbaseData.linkedin &&
                <div className="product-property row">
                  <div className="product-property-name col col-20">LinkedIn</div>
                  <div className="product-property-value col col-80">
                    <OutboundLink to={itemInfo.crunchbaseData.linkedin}>
                      {shortenUrl(itemInfo.crunchbaseData.linkedin)}
                    </OutboundLink>
                  </div>
                </div>
                }
                <div className="row">
                  { innerWidth <= 1000 &&  <div className="col col-50 single-column">
                    { firstCommitDateElement }
                    { latestCommitDateElement }
                    { contributorsCountElement }
                    { releaseDateElement }
                    { headquartersElement }
                    { crunchbaseEmployeesElement }
                    { amountElement }
                    { tickerElement }
                  </div> }
                  { innerWidth > 1000 && <div className="col col-50">
                    { firstCommitDateElement }
                    { contributorsCountElement }
                    { headquartersElement }
                    { amountElement }
                    { tickerElement }
                  </div>
                  }
                  { innerWidth > 1000 && <div className="col col-50">
                      { latestCommitDateElement }
                      { releaseDateElement }
                      { crunchbaseEmployeesElement }
                    </div>
                  }
              </div>
            </div> }
  </Fragment>;

  return (
        <div className={classNames("modal-content", {'scroll-all-content': scrollAllContent})} >
          <Head>
            <title>{`${itemInfo.name} - ${settings.global.meta.title}`}</title>
          </Head>

            <KeyHandler keyEventName="keydown" keyValue="ArrowUp" onKeyHandle={handleUp} />
            <KeyHandler keyEventName="keydown" keyValue="ArrowDown" onKeyHandle={handleDown} />


            <div className="product-scroll" ref={(x) => productScrollEl = x }>
              { !scrollAllContent && productInfo }
              { scrollAllContent && <div className="landscape-layout">
                  <div className="right-column">{productInfo}</div>
                  {charts}
                </div>
              }

            </div>
        </div>
  );
}
export default ItemDialogContent
