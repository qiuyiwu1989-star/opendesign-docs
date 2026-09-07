import { Component, Suspense, lazy, useState, type ComponentType, type ReactNode } from "react";

export class FeatureBoundary extends Component<{
  name: string; onRetry: () => void; children: ReactNode;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="feature-message" role="alert">
      <span>{this.props.name}暂时无法打开。</span>
      <button onClick={this.props.onRetry}>重试</button>
    </div> : this.props.children;
  }
}

/** Declare at module scope. A fresh lazy identity is created only after explicit retry. */
export function deferredFeature<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, name: string) {
  const Initial = lazy(load);
  return function DeferredFeature(props: P) {
    const [feature, setFeature] = useState(() => ({ View: Initial, attempt: 0 }));
    const { View, attempt } = feature;
    return <FeatureBoundary key={attempt} name={name} onRetry={() => {
      setFeature(previous => ({ View: lazy(load), attempt: previous.attempt + 1 }));
    }}>
      <Suspense fallback={<div className="feature-message" role="status">正在打开{name}…</div>}>
        <View {...props} />
      </Suspense>
    </FeatureBoundary>;
  };
}
