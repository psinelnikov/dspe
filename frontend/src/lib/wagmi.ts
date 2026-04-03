import { http, createConfig } from "wagmi";
import { FLARE_COSTON2_CHAIN } from "./constants";

export const wagmiConfig = createConfig({
  chains: [FLARE_COSTON2_CHAIN],
  transports: {
    [FLARE_COSTON2_CHAIN.id]: http(),
  },
  ssr: false,
});
