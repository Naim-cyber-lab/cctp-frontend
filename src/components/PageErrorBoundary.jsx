import { Component } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

export class PageErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('CCTP: erreur d’affichage', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const loadingFailed = /dynamically imported module|module script|Loading chunk|preload|Importing a module script/i.test(String(this.state.error?.message || ''));
    return <section className="page-recovery" role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <h1>{loadingFailed ? 'Cette page n’a pas pu être chargée' : 'Cette page a rencontré un problème'}</h1>
      <p>{loadingFailed ? 'Une mise à jour ou une interruption de connexion peut en être la cause.' : 'Vous pouvez revenir à vos CCTP ou recharger l’application.'} Vos modifications déjà enregistrées sont conservées.</p>
      <div>
        {this.props.onHome && <button className="secondary" onClick={this.props.onHome}><ArrowLeft size={16} /> Mes CCTP</button>}
        <button className="primary" onClick={() => window.location.reload()}><RefreshCw size={16} /> Recharger la page</button>
      </div>
      <small>Les modifications non enregistrées peuvent être perdues en quittant cette page.</small>
    </section>;
  }
}
