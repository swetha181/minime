import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"MiniMe",description:"Your pixel productivity buddy—plan naturally and do it together.",icons:{icon:"/minime/icons/icon-192.png",apple:"/minime/icons/icon-192.png"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
