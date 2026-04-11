import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <title>TindaDone - Micro-ERP & POS</title>
        <meta name="description" content="Professional Micro-ERP and POS system for small businesses. Manage inventory, sales, and credit (Utang) with ease." />
        <meta property="og:title" content="TindaDone - Professional POS" />
        <meta property="og:description" content="Effortless inventory and sales tracking for small retail stores." />
        <meta property="og:type" content="website" />

        <ScrollViewStyleReset />

        {/* Using raw CSS styles to ensure the background color never flickers */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
