export default function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0 0 0 0)' }}>
      {children}
    </span>
  );
}
