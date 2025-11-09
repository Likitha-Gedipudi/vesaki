import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const count = parseInt(searchParams.get('count') || '15');
    console.log('[SEARCH] q:', q, 'count:', count);

    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SERPAPI_API_KEY not configured' }, { status: 500 });
    }

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_shopping_light');
    url.searchParams.set('q', q);
    url.searchParams.set('api_key', apiKey);

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      const text = await resp.text();
      console.warn('[SEARCH] SerpAPI HTTP', resp.status, text.slice(0,120));
      return NextResponse.json({ error: 'SerpAPI request failed', details: text }, { status: 502 });
    }

    const json = await resp.json();
    const results = Array.isArray(json?.shopping_results) ? json.shopping_results : [];
    console.log('[SEARCH] results:', results.length);
    console.log('[SEARCH] sample:', results.slice(0,3).map((r:any)=>({title:r.title, source:r.source, hasThumb: !!r.thumbnail})));

    const isExternalRetailerUrl = (u?: string) => {
      if (!u || typeof u !== 'string') return false;
      try {
        const h = new URL(u).hostname.toLowerCase();
        if (!h) return false;
        const isGoogle = h.includes('google.');
        const isSerpapi = h.includes('serpapi.com');
        return !(isGoogle || isSerpapi);
      } catch {
        return false;
      }
    };

    const pickRetailerUrl = (r: any): string => {
      const candidates = [r.link, r.product_link, r.product_page_url, r.offer?.link, r.offer?.product_link];
      for (const c of candidates) {
        if (isExternalRetailerUrl(c)) return c;
      }
      // fallback to any available link
      return r.link || r.product_link || '#';
    };

    async function fetchProductImageFromSerpProduct(productId: string): Promise<string | null> {
      try {
        const purl = new URL('https://serpapi.com/search.json');
        purl.searchParams.set('engine', 'google_shopping_product');
        purl.searchParams.set('product_id', productId);
        purl.searchParams.set('api_key', apiKey as string);
        const pres = await fetch(purl.toString());
        if (!pres.ok) return null;
        const pdata: any = await pres.json();
        const images = pdata?.images || pdata?.product_photos || [];
        const first = images[0];
        const link = first?.link || first?.thumbnail || first?.image;
        return typeof link === 'string' ? link : null;
      } catch (e) {
        console.warn('[SEARCH] product image fetch failed:', (e as Error).message);
        return null;
      }
    }

    async function fetchOgImage(pageUrl?: string): Promise<string | null> {
      if (!pageUrl) return null;
      try {
        const res = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0 VesakiBot', 'Accept': 'text/html' } });
        if (!res.ok) return null;
        const html = await res.text();
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i) || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
        let img = og?.[1] || null;
        if (img && img.startsWith('//')) img = 'https:' + img;
        if (img && img.startsWith('/')) img = new URL(img, pageUrl).toString();
        return img;
      } catch (e) {
        console.warn('[SEARCH] og:image fetch failed:', (e as Error).message);
        return null;
      }
    }

    const picked = results.slice(0, count);
    const products = await Promise.all(picked.map(async (r: any, idx: number) => {
      // Attempt to parse price and currency
      let price = 0;
      let currency = 'USD';
      if (typeof r.price === 'string') {
        const m = r.price.match(/([A-Z$£€₹]{0,3})\s*([0-9,.]+)/);
        if (m) {
          const symbol = m[1] || '';
          const amount = m[2]?.replace(/,/g, '') || '0';
          price = parseFloat(amount);
          if (symbol.includes('$')) currency = 'USD';
          else if (symbol.includes('€')) currency = 'EUR';
          else if (symbol.includes('£')) currency = 'GBP';
          else if (symbol.includes('₹')) currency = 'INR';
        }
      }

      const productUrl = pickRetailerUrl(r);

      // Guarantee thumbnail
      let imageUrl: string | null = r.thumbnail || r.image || null;
      if (!imageUrl && r.product_id) {
        imageUrl = await fetchProductImageFromSerpProduct(r.product_id);
        if (imageUrl) console.log('[SEARCH] filled via product API for', r.product_id);
      }
      if (!imageUrl) {
        imageUrl = await fetchOgImage(productUrl);
        if (imageUrl) console.log('[SEARCH] filled via og:image for', productUrl);
      }
      if (!imageUrl) {
        console.warn('[SEARCH] No image found for result', r.title);
      }

      return {
        id: `serp-${r.product_id || r.position || idx}-${Math.random().toString(36).slice(2, 8)}`,
        externalId: r.product_id || undefined,
        name: r.title || 'Product',
        brand: r.source || r.store || 'Unknown',
        price: isFinite(price) ? price : 0,
        currency,
        retailer: r.source || r.store || 'Unknown',
        category: 'search',
        subcategory: undefined,
        imageUrl: imageUrl || '',
        productUrl,
        description: r.extracted_price ? `${r.extracted_price}` : undefined,
        availableSizes: undefined,
        colors: undefined,
        inStock: true,
        trending: false,
        isNew: false,
        isEditorial: false,
        isExternal: true,
      };
    }));

    return NextResponse.json({ products, count: products.length, source: 'serpapi' });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
  }
}
