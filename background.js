// Looks up a card's product page in the regional Yoto shop. This runs in the
// background script because a content script on share.yoto.co can't read
// responses from yotoplay.com (CORS), while the background script can once
// the extension has host permission for it.

const SHOP_REGIONS = ["eu", "uk", "us", "ca", "au"];

const api = typeof browser !== "undefined" ? browser : chrome;

// "Frozen: The Songs" -> "frozen-the-songs" (the shop's product handle).
function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Product pages are Next.js pages: everything we need is in __NEXT_DATA__.
function parseProduct(html, expectedTitle) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;

  let pageProps;
  try {
    pageProps = JSON.parse(match[1]).props.pageProps;
  } catch (e) {
    return null;
  }

  const product = pageProps && pageProps.productOnPage;
  if (!product || !product.price) return null;

  // The handle is a guess from the title, so make sure it really is the same
  // card before showing its price.
  if (
    expectedTitle &&
    String(product.title).trim().toLowerCase() !==
      expectedTitle.trim().toLowerCase()
  ) {
    return null;
  }

  const offers =
    pageProps.headProps &&
    pageProps.headProps.structuredData &&
    pageProps.headProps.structuredData.offers;
  const currencyMeta = html.match(
    /property="og:price:currency" content="([A-Z]{3})"/
  );

  return {
    handle: product.handle,
    title: product.title,
    price: Number(product.price),
    currency: (offers && offers.priceCurrency) || (currencyMeta && currencyMeta[1]) || null,
    availableForSale: product.availableForSale !== false,
    clubCredits: product.clubCredits ? Number(product.clubCredits) : null,
  };
}

async function lookupProduct(region, title) {
  if (!SHOP_REGIONS.includes(region)) return null;
  const handle = slugify(title);
  if (!handle) return null;

  const url = `https://${region}.yotoplay.com/products/${handle}`;
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) return null;

  const product = parseProduct(await response.text(), title);
  return product && { ...product, url };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "yap-shop-product") return;

  lookupProduct(message.region, String(message.title || ""))
    .then((product) => sendResponse({ product }))
    .catch(() => sendResponse({ product: null }));

  return true; // keep the channel open for the async response
});

// Lets the logic be unit-tested in Node without affecting the extension.
if (typeof module !== "undefined") {
  module.exports = { slugify, parseProduct };
}
