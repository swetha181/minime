export default function Home() {
  return (
    <main className="site-shell">
      <iframe
        className="minime-app"
        src="/minime/index.html"
        title="MiniMe productivity buddy"
        allow="microphone; camera; notifications; picture-in-picture"
      />
    </main>
  );
}
