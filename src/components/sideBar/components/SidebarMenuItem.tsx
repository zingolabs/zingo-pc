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
  /**
   * A word under the name, smaller than it.
   *
   * The sidebar is 220px and its items are set at 20px, so "Financial
   * Insight" at seventeen characters is already near the edge — a qualifier
   * on the same line would push the longest labels past it. Underneath, the
   * item's own 40px of height has room and the name stays the thing being
   * read.
   */
  qualifier?: string;
};

const SidebarMenuItem = ({ name, routeName, currentRoute, iconname, qualifier }: SidebarMenuItemProps) => {
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
        {!!qualifier && <div className={styles.sidebarmenuqualifier}>{qualifier}</div>}
      </Link>
    </div>
  );
};

export default SidebarMenuItem;
