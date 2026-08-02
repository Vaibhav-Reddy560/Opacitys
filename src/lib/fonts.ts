import localFont from "next/font/local";

/**
 * Nemesis — reserved EXCLUSIVELY for the OPACITYS wordmark. It is never
 * applied to headings, body copy, or UI text anywhere else in the app.
 * Exposed as --font-wordmark so misuse is easy to spot in review.
 */
export const nemesis = localFont({
  src: "../../public/Fonts/nemesis-font/Nemesis.ttf",
  variable: "--font-wordmark",
  display: "swap",
  weight: "400",
});

/**
 * Chillax — the body/UI typeface for everything else. Uses the variable
 * cut so the full 200–700 weight range costs a single file.
 */
export const chillax = localFont({
  src: "../../public/Fonts/chillax-font/Fonts/WEB/fonts/Chillax-Variable.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "200 700",
});
