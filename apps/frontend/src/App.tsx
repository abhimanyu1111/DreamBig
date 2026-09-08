import { useUser } from "./hooks/useUser";
import { supabase } from "./hooks/useSupabase";
import axios from "axios";
import { useState } from "react";

function App() {
  const claims = useUser();

  return (
    <div>
      {!claims && (
        <button
          onClick={async () => {
            await supabase.auth.signInWithWeb3({
              chain: "solana",
              statement:
                "I confirm that i want to signin to prediction market DreamBig",
            });
          }}
        >
          Signin with Solana
        </button>
      )}

      {claims && (
        <button
          onClick={async () => {
            await supabase.auth.signOut();
          }}
        >
          Logout
        </button>
      )}

      <br />
      <br />

      <button
        onClick={async () => {
          await supabase.auth.getSession().then((supabase_res) => {
            axios.post(
              "http://localhost:3000/buy",
              {
                marketId: "1",
                side: "yes",
                type: "buy",
                price: 10,
                qty: 10,
              },
              {
                headers: {
                  authorization: supabase_res.data.session?.access_token,
                },
              },
            );
          });
        }}
      >
        Click here to buy
      </button>

      <br />
      <br />
      <button
        onClick={async () => {
          await supabase.auth.getSession().then((supabase_res) => {
            axios.post(
              "http://localhost:3000/sell",
              {},
              {
                headers: {
                  authorization: supabase_res.data.session?.access_token,
                },
              },
            );
          });
        }}
      >
        Click here for sell
      </button>

      <br />
      <br />
      <button
        onClick={async () => {
          await supabase.auth.getSession().then((supabase_res) => {
            const token = supabase_res.data;
            axios.post(
              "http://localhost:3000/split",
              {},
              {
                headers: {
                  authorization: token.session?.access_token,
                },
              },
            );
          });
        }}
      >
        click here to split
      </button>

      <br />
      <br />
      <button
        onClick={async () => {
          await supabase.auth.getSession().then(async (supabase_res) => {
            const token = supabase_res.data;
            const response = await axios.post(
              "http://localhost:3000/merge",
              {
                position: "YES",
                quantity: 100,
                price: 500,
              },
              {
                headers: {
                  authorization: token.session?.access_token,
                },
              },
            );
            console.log(response.data);
          });
        }}
      >
        Click to merge
      </button>
      <br />
      <br />

      <button
        onClick={async () => {
          await supabase.auth.getSession().then(async (supabase_res) => {
            const token = supabase_res.data;
            await axios.get("http://localhost:3000/position", {
              headers: {
                authorization: token.session?.access_token,
              },
            });
          });
        }}
      >
        view position
      </button>
    </div>
  );
}

export default App;
