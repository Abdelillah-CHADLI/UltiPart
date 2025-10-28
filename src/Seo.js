import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function Seo({ title, description, url, image }) {
  const fullTitle = title ? `${title} — Velvet Axiom` : 'Velvet Axiom — Boutique en ligne';
  const desc = description || 'Boutique de cosmétiques bio, compléments alimentaires, maquillage et parfums — Livraison en Algérie.';
  const img = image || `${process.env.PUBLIC_URL}/social-preview.svg`;
  const loc = url || `${process.env.PUBLIC_URL}/`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:url" content={loc} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      <link rel="canonical" href={loc} />
    </Helmet>
  );
}
