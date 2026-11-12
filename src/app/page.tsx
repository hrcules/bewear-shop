import { type Campanha, LandingPage } from "./_components/landing-page";

// Regera a página a cada hora para a campanha trocar sozinha na data certa.
export const revalidate = 3600;

// Datas da campanha de fim de ano (horário de Fortaleza, inclusivas).
const FIM_BLACK_FRIDAY = "2026-11-20";
const FIM_NATAL = "2026-12-20";

function hojeEmFortaleza() {
  // en-CA formata como AAAA-MM-DD, o que permite comparar como texto.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date());
}

function campanhaAtual(hoje: string): Campanha {
  if (hoje <= FIM_BLACK_FRIDAY) return "black-friday";
  if (hoje <= FIM_NATAL) return "natal";
  return null;
}

export default function Page() {
  return <LandingPage campanha={campanhaAtual(hojeEmFortaleza())} />;
}
