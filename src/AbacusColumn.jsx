import React, { useState } from "react";

export default function AbacusColumn({ placeValue, onChange }) {
  const [topActive, setTopActive] = useState(false);
  const [bottomCount, setBottomCount] = useState(0);

  const toggleTop = () => {
    const newTop = !topActive;
    setTopActive(newTop);
    onChange(placeValue * (newTop ? 5 : -5));
  };

  const setBottom = (count) => {
    const diff = count - bottomCount;
    setBottomCount(count);
    onChange(placeValue * diff);
  };

  return (
    <div className="column">
      <div
        className={topActive ? "bead active" : "bead"}
        onClick={toggleTop}
      ></div>

      <div className="divider"></div>

      {[1,2,3,4].map((i) => (
        <div
          key={i}
          className={bottomCount >= i ? "bead active" : "bead"}
          onClick={() => setBottom(i)}
        ></div>
      ))}
    </div>
  );
}