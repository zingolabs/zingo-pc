import logo from "../../assets/img/logobig.png";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSnowflake } from '@fortawesome/free-solid-svg-icons'; 
import Utils from '../../utils/utils';

type LogoProps = {
  readOnly: boolean;
}

const Logo = ({ readOnly }: LogoProps) => {

  return (
    <>
      <div style={{ color: Utils.getCssVariable('--color-zingo'), fontWeight: "bold", marginBottom: 10 }}>Zingo PC v2.0.0</div>
      <div>
        <img src={logo} width="70" alt="logo" style={{ borderRadius: 5, marginRight: 10 }} />
        {readOnly && (
          <FontAwesomeIcon icon={faSnowflake} color={Utils.getCssVariable('--color-zingo')} style={{ height: 30, marginBottom: 20 }} />
        )}
      </div>
    </>
  );
}

export default Logo;