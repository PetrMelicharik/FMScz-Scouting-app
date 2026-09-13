export const metadata = {
  title: "Dosier — skautovací nástroj",
  description: "Skautská databáze fotbalových hráčů se statistikami, srovnáním a žebříčky.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body style={{ margin: 0, background: "#F7F8FA", minHeight: "100vh", padding: 24 }}>
        {children}
      </body>
    </html>
  );
}
