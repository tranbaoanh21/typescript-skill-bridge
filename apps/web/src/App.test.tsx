import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('communicates the product value proposition', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Find your next team. Build work that matters.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Discover projects')).toBeInTheDocument();
    expect(screen.getByText('Build a team')).toBeInTheDocument();
    expect(screen.getByText('Show your work')).toBeInTheDocument();
  });
});
