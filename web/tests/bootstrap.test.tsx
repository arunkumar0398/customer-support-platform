import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('web bootstrap', () => {
  it('renders the application shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Customer Support Platform' })).toBeInTheDocument();
  });
});
