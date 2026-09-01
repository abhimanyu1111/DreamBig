import { useUser } from "./hooks/useUser";
import { supabase } from "./hooks/useSupabase";
import axios from "axios";

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
            console.log(supabase_res.data.session?.access_token);
            axios.post(
              "http://localhost:3000/buy",
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
        Click here to buy
      </button>

      <br />
      <br />
      <button
        onClick={async () => {
          await supabase.auth.getSession().then((supabase_res) => {
            console.log(supabase_res.data.session?.access_token);
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
    </div>
  );
}

export default App;
