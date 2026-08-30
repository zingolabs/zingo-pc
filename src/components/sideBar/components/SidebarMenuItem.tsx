import React from "react";
import { Link } from "react-router-dom";
import styles from "../Sidebar.module.css";
import routes from "../../../constants/routes.json";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type SidebarMenuItemProps = {
  name: string;
  routeName: string;
  currentRoute: string;
  iconname: IconDefinition;
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
    <div className={`${styles.sidebarmenuitem} ${activeColorClass}`}>
      <Link to={routeName} aria-current={isActive ? "page" : undefined}>
        <span className={activeColorClass}>
          <FontAwesomeIcon icon={iconname} />
          &nbsp; &nbsp;
          {name}
        </span>
      </Link>
    </div>
  );
};

export default SidebarMenuItem;
