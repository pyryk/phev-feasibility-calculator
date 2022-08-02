import React, { ReactNode, useState } from "react";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";

export default function ButtonPopover({
  buttonLabel,
  children,
}: {
  buttonLabel: ReactNode;
  children: ReactNode;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;

  return (
    <>
      <button
        className="popover-button"
        aria-describedby={id}
        onClick={handleClick}
      >
        {buttonLabel}
      </button>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
      >
        <Box sx={{ p: 2 }}>{children}</Box>
      </Popover>
    </>
  );
}
