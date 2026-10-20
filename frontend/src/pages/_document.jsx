import { Html, Head, Main, NextScript } from 'next/document';

// Runs before first paint so the saved light/dark theme never flashes.
// Must stay in sync with THEME_STORAGE_KEY in hooks/useTheme.js.
const themeScript = `(function(){try{var p=localStorage.getItem('theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var t=d?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en-MY">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Inter: used where Apple's SF Pro isn't installed (Windows, Android, Linux). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
