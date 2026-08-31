import {useUser} from "./hooks/useUser"
import { supabase } from "./hooks/useSupabase";

function App() {

  const claims = useUser();

  return (
    <div>
      {!claims && <button
        onClick={async () => {
          await supabase.auth.signInWithWeb3({
            chain: "solana",
            statement:
              "I confirm that i want to signin to prediction market DreamBig",
          });
        }}
      >
        Signin with Solana
      </button>}

      {claims && <button onClick={async () => {
        supabase.auth.signOut()
      }}>Logout</button>}
    </div>
  );
}

export default App;
