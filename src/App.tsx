import logo from "./assets/img/logobig.png";
import "./App.css";

//import addon from "./native.node";

function App() {
  //console.log("Addon is:");
  //console.log(addon);

  return (
    <div className="App">
      <header className="App-header">
        <p>Built using CRA electron-builder-typescript Template.</p>
        {/*<p>{addon.zingolib_say_hello("Me")}</p>*/}
        <img src={logo} className="App-logo" alt="logo" />
        <p>Zingo PC v1.0.3</p>
        <p>
          Edit <code>public/electron.js</code> or <code>src/App.js</code> and save to reload.
        </p>
        d
      </header>
    </div>
  );
}

export default App;
