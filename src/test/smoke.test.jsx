import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('entorno de tests', () => {
  it('monta React y matchers de Testing Library', () => {
    render(<p>Crux tests</p>)
    expect(screen.getByText('Crux tests')).toBeInTheDocument()
  })
})
