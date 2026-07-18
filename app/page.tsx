import type { Metadata } from "next";
import { MetroTyping } from "./MetroTyping";
import {
  getCityConfig,
  getCityDescription,
  getCityTitle,
} from "../lib/metro/cities";

const city = getCityConfig("hangzhou");

export const metadata: Metadata = {
  title: getCityTitle(city),
  description: getCityDescription(city),
  alternates: { canonical: city.path },
  openGraph: {
    title: getCityTitle(city),
    description: getCityDescription(city),
    url: city.path,
  },
  twitter: {
    title: getCityTitle(city),
    description: getCityDescription(city),
  },
};

export default function Home() {
  return <MetroTyping cityId="hangzhou" />;
}
