import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MetroTyping } from "../MetroTyping";
import {
  cityIds,
  getCityConfig,
  getCityDescription,
  getCityTitle,
  isCityId,
} from "../../lib/metro/cities";

export function generateStaticParams() {
  return cityIds.map((city) => ({ city }));
}

export const dynamicParams = false;

type CityPageProps = {
  params: Promise<{ city: string }>;
};

export async function generateMetadata({
  params,
}: CityPageProps): Promise<Metadata> {
  const { city: cityId } = await params;
  if (!isCityId(cityId)) return {};
  const city = getCityConfig(cityId);

  return {
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
}

export default async function CityPage({ params }: CityPageProps) {
  const { city: cityId } = await params;
  if (!isCityId(cityId)) notFound();

  return <MetroTyping cityId={cityId} />;
}
