/**
 * A miniature site held in memory, shared by the tests that need a whole crawl
 * rather than a single page. Real markup is the fixtures' job; this exists to make
 * the *shape* of a site — two hops to the subcategories, pagination, a Product
 * reachable twice — cheap to state.
 */
import type { FetchText } from '../src/http.ts';

export const ORIGIN = 'https://site.test';
export const ENTRY = `${ORIGIN}/static`;

function link(className: string, href: string): string {
  return `<a class="${className}" href="${href}">x</a>`;
}

export function navPage(options: {
  categories?: string[];
  subcategories?: string[];
  products?: string[];
  lastPage?: number;
}): string {
  const { categories = [], subcategories = [], products = [], lastPage = 1 } = options;
  const pageLinks = Array.from({ length: lastPage }, (_, index) => link('page-link', `?page=${index + 1}`));

  return `<html><body>
    ${categories.map((href) => link('category-link', href)).join('')}
    ${subcategories.map((href) => link('subcategory-link', href)).join('')}
    ${products.map((href) => link('title', href)).join('')}
    ${lastPage > 1 ? pageLinks.join('') : ''}
  </body></html>`;
}

export function productPage(options: {
  name: string;
  price: string;
  storage?: [number, boolean][];
  colors?: string[];
}): string {
  const { name, price, storage = [], colors = [] } = options;
  const swatches = storage
    .map(([sizeGb, enabled]) => `<button class="swatch" value="${sizeGb}"${enabled ? '' : ' disabled'}>x</button>`)
    .join('');
  const colorOptions = ['<option value="">Select color</option>', ...colors.map((c) => `<option value="${c}">${c}</option>`)].join('');

  return `<html><body>
    <h4 class="title" itemprop="name">${name}</h4>
    <p class="description" itemprop="description">${name} description</p>
    <h4 itemprop="price">${price}</h4>
    ${colors.length > 0 ? `<select aria-label="color">${colorOptions}</select>` : ''}
    ${storage.length > 0 ? `<div class="swatches">${swatches}</div>` : ''}
  </body></html>`;
}

export const SITE: Record<string, string> = {
  // The entry page carries categories and randomly-featured Product cards, but no
  // subcategories — the sidebar there is empty. Reading Products from it would be
  // nondeterministic, so `/static/product/99` must never be fetched.
  [ENTRY]: navPage({ categories: ['/static/computers', '/static/phones'], products: ['/static/product/99'] }),
  [`${ORIGIN}/static/computers`]: navPage({
    categories: ['/static/computers', '/static/phones'],
    subcategories: ['/static/computers/laptops', '/static/computers/tablets'],
  }),
  [`${ORIGIN}/static/phones`]: navPage({
    categories: ['/static/computers', '/static/phones'],
    subcategories: ['/static/phones/touch'],
  }),
  [`${ORIGIN}/static/computers/laptops`]: navPage({
    subcategories: ['/static/computers/laptops', '/static/computers/tablets'],
    products: ['/static/product/1', '/static/product/2'],
    lastPage: 2,
  }),
  [`${ORIGIN}/static/computers/laptops?page=2`]: navPage({ products: ['/static/product/3'], lastPage: 2 }),
  // Links product/3 again: the same Product is reachable from two Category Pages.
  [`${ORIGIN}/static/computers/tablets`]: navPage({ products: ['/static/product/3', '/static/product/4'] }),
  [`${ORIGIN}/static/phones/touch`]: navPage({ products: ['/static/product/5'] }),

  [`${ORIGIN}/static/product/1`]: productPage({
    name: 'Laptop',
    price: '$100.00',
    storage: [
      [128, true],
      [256, true],
      [1024, false],
    ],
  }),
  [`${ORIGIN}/static/product/2`]: productPage({ name: 'Ultrabook', price: '$10.50', colors: ['Gold', 'White'] }),
  [`${ORIGIN}/static/product/3`]: productPage({ name: 'Tablet', price: '$5.00', storage: [[64, true]] }),
  [`${ORIGIN}/static/product/4`]: productPage({ name: 'Slate', price: '$1.00' }),
  [`${ORIGIN}/static/product/5`]: productPage({ name: 'Phone', price: '$2.00', colors: ['Black'] }),
  [`${ORIGIN}/static/product/99`]: productPage({ name: 'Featured', price: '$999.00' }),
};

export function recordingFetcher(site: Record<string, string> = SITE) {
  const fetched: string[] = [];

  const fetchText: FetchText = async (url) => {
    fetched.push(url);
    const body = site[url];
    if (body === undefined) throw new Error(`GET ${url} returned 404 Not Found`);
    return body;
  };

  return { fetchText, fetched };
}
