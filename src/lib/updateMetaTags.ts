// Dynamic OG meta tag updater for deep links
export function updateMetaTags(options: {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}) {
  const { title, description, image, url, type = 'website' } = options;

  const setMeta = (property: string, content: string) => {
    let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  const setName = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  if (title) {
    document.title = `${title} | Lernory Social`;
    setMeta('og:title', title);
    setName('twitter:title', title);
  }

  if (description) {
    setMeta('og:description', description);
    setName('twitter:description', description);
    setName('description', description);
  }

  if (image) {
    setMeta('og:image', image);
    setName('twitter:image', image);
  }

  if (url) {
    setMeta('og:url', url);
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (canonical) canonical.href = url;
  }

  setMeta('og:type', type);
}

export function resetMetaTags() {
  document.title = 'Lernory Social';
  updateMetaTags({
    title: 'Lernory Social',
    description: 'Connect, Learn, Share, and Earn with the best social platform. Join Lernory Social today!',
    image: `${window.location.origin}/lernory-logo.png`,
    url: window.location.origin,
  });
}
