import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Map from './Map'

vi.mock('leaflet', () => ({
  icon: vi.fn(() => ({})),
  default: { icon: vi.fn(() => ({})) },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="marker">{children}</div>
  ),
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: vi.fn(() => ({ flyTo: vi.fn() })),
}))

vi.mock('framer-motion', () => ({
  motion: {
    button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./AddGistModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="add-gist-modal" /> : null,
}))

const setupGeolocation = (
  type: 'success' | 'error',
  coords = { latitude: 6.5244, longitude: 3.3792 }
) => {
  Object.defineProperty(global.navigator, 'geolocation', {
    value: {
      getCurrentPosition: vi.fn((success, error) => {
        if (type === 'success') {
          success({ coords })
        } else {
          error?.({ code: 1, message: 'User denied geolocation' })
        }
      }),
    },
    writable: true,
    configurable: true,
  })
}

describe('Map', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setupGeolocation('success')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    render(<Map />)
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('renders the default gist markers on load', () => {
    render(<Map />)
    expect(screen.getByText('Amazing suya spot just opened here!')).toBeInTheDocument()
    expect(screen.getByText('Heads up, major traffic on this bridge.')).toBeInTheDocument()
  })

  it('renders the add gist floating button', () => {
    render(<Map />)
    expect(screen.getByRole('button', { name: /add new gist/i })).toBeInTheDocument()
  })

  it('handles geolocation success with a different location', () => {
    setupGeolocation('success', { latitude: 48.8566, longitude: 2.3522 })
    render(<Map />)
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  it('handles geolocation error gracefully and renders map at default position', () => {
    setupGeolocation('error')
    render(<Map />)
    expect(screen.getByTestId('map-container')).toBeInTheDocument()
    expect(console.warn).toHaveBeenCalled()
  })

  it('announces the resolved location in an aria-live region', () => {
    setupGeolocation('success', { latitude: 48.8566, longitude: 2.3522 })
    render(<Map />)
    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveTextContent('Map centered on 48.8566, 2.3522')
  })

  it('does not announce a location when geolocation fails', () => {
    setupGeolocation('error')
    render(<Map />)
    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toHaveTextContent('')
  })

  it('opens AddGistModal when the add button is clicked', async () => {
    render(<Map />)
    const button = screen.getByRole('button', { name: /add new gist/i })
    await act(async () => { button.click() })
    expect(screen.getByTestId('add-gist-modal')).toBeInTheDocument()
  })
})