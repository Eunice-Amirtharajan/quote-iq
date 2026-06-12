import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ApolloProvider } from '@apollo/client/react';
import { client } from './lib/apollo';
import { Analytics } from '@vercel/analytics/react';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <App />
      <Analytics />
    </ApolloProvider>
  </StrictMode>
);