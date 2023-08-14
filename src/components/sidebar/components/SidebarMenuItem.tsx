import React from "react";
import { Link } from "react-router-dom";
import styles from "../Sidebar.module.css";
import routes from "../../../constants/routes.json";

type SidebarMenuItemProps = {
  name: string;
  routeName: string;
  currentRoute: string;
  iconname: string;
};

const SidebarMenuItem = ({ name, routeName, currentRoute, iconname }: SidebarMenuItemProps) => {
  let isActive: boolean = false;

  if ((currentRoute.endsWith("app.html") && routeName === routes.HOME) || currentRoute === routeName) {
    isActive = true;
  }

  let activeColorClass: string = "";
  if (isActive) {
    activeColorClass = styles.sidebarmenuitemactive;
  }

  return (
    <div className={[styles.sidebarmenuitem, activeColorClass].join(" ")}>
      <Link to={routeName}>
        <span className={activeColorClass}>
          <i className={["fas", iconname].join(" ")} />
          &nbsp; &nbsp;
          {name}
        </span>
      </Link>
    </div>
  );
};

export default SidebarMenuItem;