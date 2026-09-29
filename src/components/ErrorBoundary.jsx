import { Component } from 'react'

/** Catches render errors below it and shows `fallback({ error, reset })`. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[CRT Album] scene crashed:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback({ error: this.state.error, reset: this.reset })
    return this.props.children
  }
}
