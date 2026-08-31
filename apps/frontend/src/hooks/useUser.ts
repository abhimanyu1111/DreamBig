import { useEffect, useState } from "react";
import { supabase } from "./useSupabase";
import { type JwtPayload } from "@supabase/supabase-js";

export function useUser() {
  const [claims, setClaims] = useState<JwtPayload | null>(null);

  useEffect(() => {
    const loadClaims = async () => {
      const { data, error } = await supabase.auth.getClaims();

      if (error || !data) {
        setClaims(null);
        return;
      }

      setClaims(data.claims);
    };

    loadClaims();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getClaims().then(({ data, error }) => {
        if (error || !data) {
          setClaims(null);
          return;
        }

        setClaims(data.claims);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  return claims;
}
