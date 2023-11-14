import logo from "../../assets/img/logobig.png";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSnowflake } from '@fortawesome/free-solid-svg-icons'; 

type LogoProps = {
  readOnly: boolean;
}

const Logo = ({ readOnly }: LogoProps) => {

  return (
    <>
      <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v1.0.4</div>
      <div>
        <img src={logo} width="70" alt="logo" style={{ borderRadius: 5, marginRight: 10 }} />
        {readOnly && (
          <FontAwesomeIcon icon={faSnowflake} color={"'#888888'"} style={{ height: 30, marginBottom: 20 }} />
        )}
      </div>
    </>
  );
}

export default Logo;