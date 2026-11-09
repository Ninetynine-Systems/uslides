import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseDeck } from '../core/parse';
import { fitSlide, type FitResult } from '../render/fit';
import { renderSlide } from '../render/renderSlide';
import { App } from './App';

declare global {
  interface Window {
    __uslides?: { render(md: string): FitResult[][]; getSource(): string };
  }
}

// Test hook for the end-to-end tests. Only installed when the URL has `?test`.
if (new URLSearchParams(location.search).has('test')) {
  const container = document.createElement('div');
  container.id = 'us-test';
  document.body.append(container);
  window.__uslides = {
    getSource: () => '',
    render(md) {
      container.replaceChildren();
      const deck = parseDeck(md);
      return deck.slides.map((slide) => {
        const stage = renderSlide(slide, deck.settings);
        container.append(stage);
        return fitSlide(stage);
      });
    },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
