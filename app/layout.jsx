import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata = {
  title: "FM Scouts cz — skautovací databáze",
  description: "Databáze fotbalových hráčů se statistikami, filtry a vyhledáváním.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>
        <NavBar />
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
